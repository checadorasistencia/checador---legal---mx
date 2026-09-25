import { useState } from 'react';
import { useApp } from '../lib/store';
import { TIPO_INCIDENCIA, esTolerancia } from '../lib/calc';
import { H, Btn, Campo, Pill, Huella } from '../components/ui';
import { fechaCorta } from '../lib/time';

/* Las fechas ya son absolutas (YYYY-MM-DD), no offsets relativos. */
const rel = (v) => typeof v === 'number' ? (() => { const d = new Date(); d.setDate(d.getDate() + v); return d; })() : new Date(v);

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function Incidencias() {
  const app = useApp();
  const [nueva, setNueva] = useState(null);
  const [cancelar, setCancelar] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [correccion, setCorreccion] = useState(null);
  const [pasoCorreccion, setPasoCorreccion] = useState('formulario'); // formulario | huella_empleado | huella_autoriza | listo

  /* Una incidencia es una decisión administrativa, no un hecho físico: por eso
     se puede revocar. Lo que no se admite es que la revocación no deje rastro,
     así que el motivo es obligatorio y queda en la pista de auditoría y en los
     reportes del periodo. */
  const confirmarCancelacion = () => {
    if (!motivo.trim()) return;
    const s = new Date().toISOString();
    app.setIncidencias((prev) => prev.map((i) => (i.id === cancelar.id
      ? { ...i, cancelada: true, motivoCancelacion: motivo.trim(), canceladaEn: s, canceladaPor: 'C. Verdugo (encargada)' }
      : i)));
    app.anotar({
      accion: 'CANCELA_INCIDENCIA',
      entidad: app.empleadoDe(cancelar.empId)?.nombre ?? cancelar.empId,
      campo: TIPO_INCIDENCIA[cancelar.tipo].label,
      antes: `vigente · ${fechaCorta(rel(cancelar.desde))} a ${fechaCorta(rel(cancelar.hasta))}`,
      despues: `cancelada · ${motivo.trim()}`,
    });
    setCancelar(null); setMotivo('');
  };

  const lista = app.incidencias
    .map((i) => ({ ...i, emp: app.empleadoDe(i.empId) }))
    .filter((i) => i.emp && (app.sucursalActiva === 'todas' || i.emp.sucursalId === app.sucursalActiva))
    .sort((a, b) => a.desde - b.desde);

  const guardar = () => {
    const item = {
      id: `i${Date.now().toString(36)}`, empId: nueva.empId, tipo: nueva.tipo,
      desde: nueva.desde, hasta: nueva.hasta, nota: nueva.nota,
      ...(nueva.minutos ? { minutos: nueva.minutos } : {}),
      creadaEn: new Date().toISOString(),
    };
    app.setIncidencias((prev) => [...prev, item]);
    app.anotar({
      accion: 'ALTA_INCIDENCIA', entidad: app.empleadoDe(item.empId)?.nombre ?? '—',
      campo: TIPO_INCIDENCIA[item.tipo].label,
      antes: '—',
      despues: `${fechaCorta(rel(item.desde))} a ${fechaCorta(rel(item.hasta))}`
        + (item.minutos ? ` · ${item.minutos} min de margen` : ''),
    });
    setNueva(null);
  };

  return (
    <div>
      <div className="flex items-start justify-between">
        <H sub="Dos familias: las que borran el día (vacaciones, permiso, incapacidad) y las que solo conceden margen porque hubo un imprevisto y la persona sí va a trabajar. Si algo se registró por error se cancela con motivo, que viaja hasta los reportes.">
          Incidencias
        </H>
        <div className="flex gap-2">
          <Btn tone="ambar" onClick={() => { setCorreccion({ empId: app.empleados[0]?.id ?? '', dia: hoyISO(), tipoMarca: 'entrada', horaEntrada: '', horaSalida: '', motivo: '', facultadoId: app.facultados[0]?.id ?? '' }); setPasoCorreccion('formulario'); }} disabled={app.empleados.length === 0}>
            Corregir olvido
          </Btn>
          <Btn tone="tinta" onClick={() => setNueva({ empId: app.empleados[0]?.id ?? '', tipo: 'llegada_tarde', desde: hoyISO(), hasta: hoyISO(), nota: '', minutos: 60 })} disabled={app.empleados.length === 0}>
            + Registrar incidencia
          </Btn>
        </div>
      </div>

      <div className="border" style={{ borderColor: 'var(--linea)', background: 'var(--papel)' }}>
        <div className="mono grid grid-cols-[1.3fr_124px_176px_1.5fr_92px] gap-3 border-b px-4 py-[9px] text-[9.5px] font-black uppercase tracking-[.14em]"
          style={{ borderColor: 'var(--linea)', color: 'var(--grafito)', background: 'var(--pergamino)' }}>
          <span>Empleado</span><span>Tipo</span><span>Periodo</span><span>Nota</span><span></span>
        </div>
        {lista.map((i) => {
          const futuro = i.desde > 0;
          const vigente = i.desde <= 0 && i.hasta >= 0;
          return (
            <div key={i.id} className="grid grid-cols-[1.3fr_124px_176px_1.5fr_92px] items-center gap-3 border-b px-4 py-[11px]"
              style={{ borderColor: 'var(--manila)', opacity: i.cancelada ? .55 : 1 }}>
              <span className="truncate text-[14px]" style={{ textDecoration: i.cancelada ? 'line-through' : 'none' }}>
                <span className="mono mr-2 text-[11px]" style={{ color: 'var(--grafito-2)' }}>{i.emp.num}</span>{i.emp.nombre}
              </span>
              <span><Pill tone={i.cancelada ? 'grafito' : esTolerancia(i.tipo) ? 'ambar' : i.tipo === 'incapacidad' ? 'tinta' : i.tipo === 'vacaciones' ? 'calibre' : 'grafito'}>{TIPO_INCIDENCIA[i.tipo].label}</Pill></span>
              <span className="mono tabnum text-[12px]" style={{ color: 'var(--carbon)' }}>
                {fechaCorta(rel(i.desde))} → {fechaCorta(rel(i.hasta))}
                {i.cancelada
                  ? <span className="ml-2 text-[9.5px] uppercase tracking-[.1em]" style={{ color: 'var(--tinta)' }}>cancelada</span>
                  : vigente ? <span className="ml-2 text-[9.5px] uppercase tracking-[.1em]" style={{ color: 'var(--calibre)' }}>vigente</span>
                  : futuro ? <span className="ml-2 text-[9.5px] uppercase tracking-[.1em]" style={{ color: 'var(--grafito-2)' }}>programada</span>
                  : null}
              </span>
              <span className="truncate text-[12.5px]" style={{ color: 'var(--grafito)' }}>
                {i.cancelada ? <em>{i.motivoCancelacion}</em> : (
                  <>
                    {i.minutos ? <span className="mono mr-2 text-[10.5px]" style={{ color: 'var(--ambar)' }}>+{i.minutos}′</span> : null}
                    {i.nota}
                  </>
                )}
              </span>
              <span className="text-right">
                {!i.cancelada && (
                  <Btn tone="tinta" ghost small onClick={() => { setCancelar(i); setMotivo(''); }}>Cancelar</Btn>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {cancelar && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,.55)' }}
          onClick={(ev) => ev.target === ev.currentTarget && setCancelar(null)}>
          <div className="w-full max-w-[440px] px-7 py-7" style={{ background: 'var(--papel)' }}>
            <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--tinta)' }}>Cancelar incidencia</div>
            <h3 className="serif mt-1 text-[25px] font-extrabold leading-tight">
              {TIPO_INCIDENCIA[cancelar.tipo].largo ?? TIPO_INCIDENCIA[cancelar.tipo].label}
              {' '}de {app.empleadoDe(cancelar.empId)?.nombre}
            </h3>
            <div className="mono mt-1 mb-5 text-[11.5px]" style={{ color: 'var(--grafito)' }}>
              {fechaCorta(rel(cancelar.desde))} a {fechaCorta(rel(cancelar.hasta))}
            </div>

            <Campo label="Motivo de la cancelación" hint="Va a la pista de auditoría y a los reportes del periodo. Es obligatorio.">
              <textarea className="w-full" rows={3} value={motivo} autoFocus
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. capturada por error, correspondía a otro empleado" />
            </Campo>

            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: 'var(--grafito-2)' }}>
              La incidencia no se borra: queda marcada como cancelada con la fecha, quién la canceló y este motivo.
              Los días vuelven a evaluarse contra el rol semanal.
            </p>

            <div className="mt-6 flex gap-2">
              <Btn onClick={confirmarCancelacion} tone="tinta" disabled={!motivo.trim()}>Cancelar incidencia</Btn>
              <Btn onClick={() => setCancelar(null)} tone="grafito" ghost>Volver</Btn>
            </div>
          </div>
        </div>
      )}

      {nueva && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,.55)' }}
          onClick={(ev) => ev.target === ev.currentTarget && setNueva(null)}>
          <div className="w-full max-w-[420px] px-7 py-7" style={{ background: 'var(--papel)' }}>
            <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--tinta)' }}>Nueva incidencia</div>
            <h3 className="serif mt-1 mb-6 text-[26px] font-extrabold">Justificar días</h3>
            <div className="space-y-4">
              <Campo label="Empleado">
                <select className="w-full" value={nueva.empId} onChange={(e) => setNueva({ ...nueva, empId: e.target.value })}>
                  {app.empleados.map((e) => <option key={e.id} value={e.id}>{e.num} · {e.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Tipo">
                <select className="w-full" value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}>
                  {Object.entries(TIPO_INCIDENCIA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Desde"><input type="date" className="w-full mono" value={nueva.desde} onChange={(e) => setNueva({ ...nueva, desde: e.target.value })} /></Campo>
                <Campo label="Hasta"><input type="date" className="w-full mono" value={nueva.hasta} onChange={(e) => setNueva({ ...nueva, hasta: e.target.value })} /></Campo>
              </div>
              <Campo label="Nota o folio" hint="Ej. folio del ST-2 del IMSS, o quién autorizó el permiso.">
                <input type="text" className="w-full" value={nueva.nota} onChange={(e) => setNueva({ ...nueva, nota: e.target.value })} />
              </Campo>
            </div>
            <div className="mt-7 flex gap-2">
              <Btn onClick={guardar} tone="tinta">Registrar</Btn>
              <Btn onClick={() => setNueva(null)} tone="grafito" ghost>Cancelar</Btn>
            </div>
          </div>
        </div>
      )}
      {/* ── Corregir olvido de checada ──────────────────────────────── */}
      {correccion && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,.55)' }}
          onClick={(ev) => { if (ev.target === ev.currentTarget && pasoCorreccion === 'formulario') setCorreccion(null); }}>
          <div className="w-full max-w-[480px] px-7 py-7" style={{ background: 'var(--papel)' }}>

            {pasoCorreccion === 'formulario' && (
              <>
                <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--ambar)' }}>
                  Corregir olvido de checada
                </div>
                <h3 className="serif mt-1 mb-2 text-[26px] font-extrabold">Asentar marca olvidada</h3>
                <p className="mb-5 text-[12px] leading-relaxed" style={{ color: 'var(--grafito-2)' }}>
                  El empleado confirma con su huella que está presente. El registro se firma con la hora
                  actual (CENAM) y la hora declarada, nunca se confunde con una checada biométrica.
                </p>
                <div className="space-y-4">
                  <Campo label="Empleado">
                    <select className="w-full" value={correccion.empId}
                      onChange={(e) => setCorreccion({ ...correccion, empId: e.target.value })}>
                      {app.empleados.filter((e) => e.activo && !e.bajaDesde).map((e) => (
                        <option key={e.id} value={e.id}>{e.num} · {e.nombre}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Día de la omisión">
                    <input type="date" className="w-full mono" value={correccion.dia}
                      onChange={(e) => setCorreccion({ ...correccion, dia: e.target.value })} />
                  </Campo>
                  <Campo label="¿Qué se olvidó checar?">
                    <div className="flex gap-2">
                      {[['entrada', 'Entrada'], ['salida', 'Salida'], ['ambas', 'Ambas']].map(([v, l]) => (
                        <button key={v}
                          className="flex-1 border px-3 py-2 text-[13px] font-bold transition-colors"
                          style={{
                            borderColor: correccion.tipoMarca === v ? 'var(--ambar)' : 'var(--linea)',
                            background: correccion.tipoMarca === v ? 'rgba(217,119,6,.08)' : 'transparent',
                            color: correccion.tipoMarca === v ? 'var(--ambar)' : 'var(--grafito)',
                          }}
                          onClick={() => setCorreccion({ ...correccion, tipoMarca: v })}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </Campo>
                  {(correccion.tipoMarca === 'entrada' || correccion.tipoMarca === 'ambas') && (
                    <Campo label="Hora de entrada declarada">
                      <input type="datetime-local" className="w-full mono" value={correccion.horaEntrada}
                        onChange={(e) => setCorreccion({ ...correccion, horaEntrada: e.target.value })} />
                    </Campo>
                  )}
                  {(correccion.tipoMarca === 'salida' || correccion.tipoMarca === 'ambas') && (
                    <Campo label="Hora de salida declarada">
                      <input type="datetime-local" className="w-full mono" value={correccion.horaSalida}
                        onChange={(e) => setCorreccion({ ...correccion, horaSalida: e.target.value })} />
                    </Campo>
                  )}
                  <Campo label="Motivo" hint="Obligatorio. Va firmado dentro del hash, no se puede cambiar después.">
                    <textarea className="w-full" rows={2} value={correccion.motivo}
                      onChange={(e) => setCorreccion({ ...correccion, motivo: e.target.value })}
                      placeholder="Ej. olvidó checar, confirmado con el gerente de piso" />
                  </Campo>
                  <Campo label="Autoriza">
                    <select className="w-full" value={correccion.facultadoId}
                      onChange={(e) => setCorreccion({ ...correccion, facultadoId: e.target.value })}>
                      {app.facultados.map((f) => <option key={f.id} value={f.id}>{f.nombre} · {f.cargo}</option>)}
                    </select>
                  </Campo>
                </div>
                <div className="mt-5 border-l-[3px] px-4 py-3" style={{ borderColor: 'var(--ambar)', background: 'rgba(217,119,6,.05)' }}>
                  <p className="text-[12px] leading-relaxed">
                    Se pedirá la <strong>huella del empleado</strong> para confirmar que está presente,
                    y la <strong>huella de quien autoriza</strong>. Ambas quedan en el registro firmado.
                  </p>
                </div>
                <div className="mt-6 flex gap-2">
                  <Btn tone="ambar" onClick={() => {
                    if (!correccion.motivo.trim() || !correccion.facultadoId) return;
                    if (correccion.tipoMarca !== 'salida' && !correccion.horaEntrada) return;
                    if (correccion.tipoMarca !== 'entrada' && !correccion.horaSalida) return;
                    setPasoCorreccion('huella_empleado');
                  }}
                    disabled={!correccion.motivo.trim() || !correccion.facultadoId
                      || (correccion.tipoMarca !== 'salida' && !correccion.horaEntrada)
                      || (correccion.tipoMarca !== 'entrada' && !correccion.horaSalida)}>
                    Continuar
                  </Btn>
                  <Btn tone="grafito" ghost onClick={() => setCorreccion(null)}>Cancelar</Btn>
                </div>
              </>
            )}

            {pasoCorreccion === 'huella_empleado' && (
              <>
                <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--ambar)' }}>
                  Paso 1 de 2 · Huella del empleado
                </div>
                <h3 className="serif mt-1 mb-5 text-[24px] font-extrabold leading-tight">
                  {app.empleadoDe(correccion.empId)?.nombre}
                </h3>
                <div className="flex items-center gap-4 border px-5 py-6" style={{ borderColor: 'var(--ambar)', background: 'var(--pergamino)' }}>
                  <span className="tick" style={{ color: 'var(--ambar)' }}><Huella size={36} /></span>
                  <div>
                    <div className="text-[14px] font-bold">Que el empleado ponga su dedo en el lector</div>
                    <div className="mono mt-1 text-[10.5px]" style={{ color: 'var(--grafito)' }}>
                      confirma que está presente al momento de la corrección
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <Btn tone="ambar" onClick={() => {
                    setPasoCorreccion('huella_autoriza');
                  }}>
                    Huella leída, continuar
                  </Btn>
                  <Btn tone="grafito" ghost onClick={() => setPasoCorreccion('formulario')}>Volver</Btn>
                </div>
              </>
            )}

            {pasoCorreccion === 'huella_autoriza' && (
              <>
                <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--tinta)' }}>
                  Paso 2 de 2 · Huella de quien autoriza
                </div>
                <h3 className="serif mt-1 mb-5 text-[24px] font-extrabold leading-tight">
                  {app.facultados.find((f) => f.id === correccion.facultadoId)?.nombre}
                </h3>
                <div className="flex items-center gap-4 border px-5 py-6" style={{ borderColor: 'var(--tinta)', background: 'var(--pergamino)' }}>
                  <span className="tick" style={{ color: 'var(--tinta)' }}><Huella size={36} /></span>
                  <div>
                    <div className="text-[14px] font-bold">Que quien autoriza ponga su dedo en el lector</div>
                    <div className="mono mt-1 text-[10.5px]" style={{ color: 'var(--grafito)' }}>
                      sin esta firma biométrica la corrección no se guarda
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <Btn tone="tinta" onClick={() => {
                    const empNom = app.empleadoDe(correccion.empId)?.nombre ?? correccion.empId;
                    if (correccion.tipoMarca === 'entrada' || correccion.tipoMarca === 'ambas') {
                      app.asentarMarca({
                        empId: correccion.empId, tipo: 'entrada',
                        horaDeclarada: new Date(correccion.horaEntrada).toISOString(),
                        dia: correccion.dia, motivo: correccion.motivo.trim(),
                        facultadoId: correccion.facultadoId, huellaEmpleado: true,
                      });
                    }
                    if (correccion.tipoMarca === 'salida' || correccion.tipoMarca === 'ambas') {
                      app.asentarMarca({
                        empId: correccion.empId, tipo: 'salida',
                        horaDeclarada: new Date(correccion.horaSalida).toISOString(),
                        dia: correccion.dia, motivo: correccion.motivo.trim(),
                        facultadoId: correccion.facultadoId, huellaEmpleado: true,
                      });
                    }
                    setPasoCorreccion('listo');
                  }}>
                    Firmar y guardar corrección
                  </Btn>
                  <Btn tone="grafito" ghost onClick={() => setPasoCorreccion('huella_empleado')}>Volver</Btn>
                </div>
              </>
            )}

            {pasoCorreccion === 'listo' && (
              <>
                <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--calibre)' }}>
                  Corrección guardada
                </div>
                <h3 className="serif mt-1 mb-4 text-[26px] font-extrabold">
                  {app.empleadoDe(correccion.empId)?.nombre}
                </h3>
                <div className="border-l-[3px] px-4 py-3" style={{ borderColor: 'var(--calibre)', background: 'rgba(22,163,74,.05)' }}>
                  <p className="text-[12.5px] leading-relaxed">
                    {correccion.tipoMarca === 'ambas' ? 'Entrada y salida asentadas' : `${correccion.tipoMarca === 'entrada' ? 'Entrada' : 'Salida'} asentada`}
                    {' '}para el {correccion.dia}. Confirmada con huella del empleado y
                    autorizada por {app.facultados.find((f) => f.id === correccion.facultadoId)?.nombre}.
                    Aparece señalada en reportes e impresiones, nunca como checada biométrica.
                  </p>
                </div>
                <div className="mt-6">
                  <Btn tone="calibre" onClick={() => { setCorreccion(null); setPasoCorreccion('formulario'); }}>
                    Listo
                  </Btn>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}