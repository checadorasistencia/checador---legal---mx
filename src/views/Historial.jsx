import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { jornadas, ETIQUETA, TIPO_INCIDENCIA } from '../lib/calc';
import { hhmm, hhmmss, fechaCorta, diaSemana, horasDeMin, pesos } from '../lib/time';
import { salarioEn } from '../lib/vigencia';
import { corto } from '../lib/chain';
import { Btn, Pill, Campo, Huella } from '../components/ui';

const iso = (d) => d.toISOString().slice(0, 10);
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

export default function Historial({ empId, desde, hasta, onCerrar }) {
  const app = useApp();
  const emp = app.empleadoDe(empId);
  const [asiento, setAsiento] = useState(null);
  const [form, setForm] = useState({ hora: '', motivo: '', facultadoId: '' });
  const [leyendo, setLeyendo] = useState(false);

  const js = useMemo(() => jornadas({
    registros: app.registros, empleados: app.empleados, turnos: app.turnos,
    incidencias: app.incidencias, rol: app.rol, publicadas: app.publicadas,
    inicioSemana: app.inicioSemana, toleranciaGlobal: app.config.toleranciaGlobal,
    toleranciaAnticipoMin: app.config.toleranciaAnticipoMin ?? 20,
    desde, hasta, sucursal: 'todas',
  }).filter((j) => j.emp.id === empId).reverse(),
  [app.registros, app.empleados, app.turnos, app.incidencias, app.rol, app.publicadas, app.inicioSemana, app.config.toleranciaGlobal, desde, hasta, empId]);

  if (!emp) return null;

  const abrirAsiento = (j, tipo) => {
    const base = new Date(j.fecha);
    const ref = tipo === 'salida' ? (j.turno?.salida ?? '18:00') : (j.turno?.entrada ?? '08:00');
    const [h, m] = ref.split(':').map(Number);
    base.setHours(h, m, 0, 0);
    setForm({ hora: base.toISOString().slice(0, 16), motivo: '', facultadoId: app.facultados[0]?.id ?? '' });
    setAsiento({ j, tipo });
  };

  const dentroDePlazo = (j) => (Date.now() - new Date(j.fecha).getTime()) <= 72 * 3600000;

  const confirmar = () => {
    if (!form.motivo.trim() || !form.facultadoId) return;
    setLeyendo(true);
    setTimeout(() => {
      app.asentarMarca({
        empId, tipo: asiento.tipo,
        horaDeclarada: new Date(form.hora).toISOString(),
        dia: asiento.j.dia, motivo: form.motivo.trim(), facultadoId: form.facultadoId,
      });
      setLeyendo(false);
      setAsiento(null);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end" style={{ background: 'rgba(15,23,42,.55)' }}
      onClick={(ev) => ev.target === ev.currentTarget && onCerrar()}>
      <div className="w-[720px] overflow-y-auto" style={{ background: 'var(--papel)' }}>
        <div className="sticky top-0 z-10 border-b px-7 py-5" style={{ background: 'var(--papel)', borderColor: 'var(--linea)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--tinta)' }}>
                Historial · {fechaCorta(desde)} a {fechaCorta(hasta)}
              </div>
              <h3 className="serif mt-1 text-[27px] font-extrabold leading-tight">{emp.nombre}</h3>
              <div className="mono mt-[3px] text-[11px]" style={{ color: 'var(--grafito)' }}>
                No. {emp.num} · {emp.puesto} · ${pesos(salarioEn(emp, new Date()))} diarios
                {emp.bajaDesde && ` · baja ${fechaCorta(emp.bajaDesde)}`}
              </div>
            </div>
            <Btn tone="grafito" ghost small onClick={onCerrar}>Cerrar</Btn>
          </div>
        </div>
        <div className="px-7 py-6">
          {js.length === 0 && (
            <p className="py-8 text-center text-[13px]" style={{ color: 'var(--grafito-2)' }}>
              Sin jornadas en este periodo.
            </p>
          )}
          <div className="space-y-[2px]">
            {js.map((j) => {
              const m = (t) => j.marcas.find((x) => x.tipo === t);
              const falta = j.esFalta;
              const tono = falta ? 'var(--tinta)' : j.esRetardo ? 'var(--ambar)' : j.incidencia ? 'var(--calibre)' : 'var(--linea)';
              return (
                <div key={j.dia} className="border-l-[3px] py-[9px] pl-4" style={{ borderColor: tono }}>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="mono w-[130px] shrink-0 text-[12px]">
                      {diaSemana(j.fecha)} {fechaCorta(j.fecha)}
                      {j.festivo && <span className="ml-1" style={{ color: 'var(--tinta)' }}>✱</span>}
                      {j.domingo && !j.festivo && <span className="ml-1" style={{ color: 'var(--ambar)' }}>°</span>}
                    </span>
                    {j.incidencia ? (
                      <span className="text-[12.5px]" style={{ color: TIPO_INCIDENCIA[j.incidencia.tipo]?.color }}>
                        {TIPO_INCIDENCIA[j.incidencia.tipo]?.largo ?? TIPO_INCIDENCIA[j.incidencia.tipo]?.label}
                        {j.incidencia.nota && <span style={{ color: 'var(--grafito)' }}> — {j.incidencia.nota}</span>}
                      </span>
                    ) : j.descansoObligatorio ? (
                      <span className="text-[12.5px]" style={{ color: 'var(--calibre)' }}>{j.festivo} · descanso de ley</span>
                    ) : falta ? (
                      <span className="text-[12.5px]" style={{ color: 'var(--tinta)' }}>Falta · se esperaba {j.turno?.entrada}</span>
                    ) : (
                      <>
                        <span className="mono tabnum text-[12.5px]">
                          {m('entrada') ? hhmm(m('entrada').tsCenam) : '—'}
                          <span style={{ color: 'var(--linea)' }}> → </span>
                          {m('salida') ? hhmm(m('salida').tsCenam)
                            : m('salida_asentada') ? `${hhmm(m('salida_asentada').horaDeclarada)}*` : '—'}
                        </span>
                        <span className="mono text-[11px]" style={{ color: 'var(--grafito)' }}>
                          {j.ordinarioMin ? `${horasDeMin(j.ordinarioMin)} h` : ''}
                          {j.extraMin > 0 && <span style={{ color: 'var(--calibre)' }}> +{horasDeMin(j.extraMin)} extra</span>}
                        </span>
                        {j.esRetardo && <Pill tone="ambar">retardo {j.retardoMin}′</Pill>}
                        {j.enCurso && <Pill tone="calibre">en turno</Pill>}
                        {j.comidaAbierta && <Pill tone="ambar">comida est. {j.comidaEstimada}′</Pill>}
                        {j.salioAntes && <Pill tone="ambar">salió {j.faltanteMin}′ antes</Pill>}
                        {j.marcaEnDescanso && <Pill tone="ambar">día de descanso</Pill>}
                        {j.sinRol && <Pill tone="tinta">sin rol</Pill>}
                      </>
                    )}
                    {j.abierta && !j.incidencia && (
                      <span className="ml-auto flex items-center gap-2">
                        <Pill tone="tinta">sin marcar salida</Pill>
                        {dentroDePlazo(j) ? (
                          <Btn tone="tinta" ghost small onClick={() => abrirAsiento(j, 'salida')}>Asentar salida</Btn>
                        ) : (
                          <span className="mono text-[10px]" style={{ color: 'var(--grafito-2)' }}>fuera del plazo de 72 h</span>
                        )}
                      </span>
                    )}
                    {j.esFalta && !j.incidencia && (
                      <span className="ml-auto flex items-center gap-2">
                        {dentroDePlazo(j) ? (
                          <Btn tone="tinta" ghost small onClick={() => abrirAsiento(j, 'entrada')}>Asentar entrada</Btn>
                        ) : (
                          <span className="mono text-[10px]" style={{ color: 'var(--grafito-2)' }}>fuera del plazo de 72 h</span>
                        )}
                      </span>
                    )}
                  </div>
                  {j.marcas.length > 0 && (
                    <div className="mono mt-[5px] flex flex-wrap gap-x-4 gap-y-[2px] pl-[130px] text-[10px]" style={{ color: 'var(--grafito-2)' }}>
                      {j.marcas.map((r) => (
                        <span key={r.id} title={`sello UTC(CNM) ${r.tsCenam} · hash ${r.hash}`}>
                          {ETIQUETA[r.tipo] ?? r.tipo} {hhmmss(r.horaDeclarada ?? r.tsCenam)}
                          {r.tipo.endsWith('_asentada') && (
                            <span style={{ color: 'var(--tinta)' }}> · asentada por {r.asentadaPor}</span>
                          )}
                          {!r.ntpOk && <span style={{ color: 'var(--ambar)' }}> · sin ntp</span>}
                          {' '}<span style={{ color: 'var(--linea)' }}>{corto(r.hash)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {asiento && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,.65)' }}
            onClick={(ev) => ev.target === ev.currentTarget && setAsiento(null)}>
            <div className="w-full max-w-[470px] px-7 py-7" style={{ background: 'var(--papel)' }}>
              <div className="mono text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--tinta)' }}>
                Asentar {asiento.tipo} olvidada
              </div>
              <h3 className="serif mt-1 text-[24px] font-extrabold leading-tight">{emp.nombre}</h3>
              <div className="mono mt-1 mb-5 text-[11.5px]" style={{ color: 'var(--grafito)' }}>
                {diaSemana(asiento.j.fecha)} {fechaCorta(asiento.j.fecha)}{asiento.j.turno ? ` · turno ${asiento.j.turno.entrada}–${asiento.j.turno.salida}` : ''}
              </div>
              <div className="space-y-4">
                <Campo label="Hora que se declara">
                  <input type="datetime-local" className="w-full mono" value={form.hora} autoFocus
                    onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                </Campo>
                <Campo label="Motivo" hint="Obligatorio. Va firmado dentro del hash, así que no se puede cambiar después.">
                  <textarea className="w-full" rows={2} value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Ej. olvidó checar, confirmado con el gerente de piso" />
                </Campo>
                <Campo label="Autoriza">
                  <select className="w-full" value={form.facultadoId}
                    onChange={(e) => setForm({ ...form, facultadoId: e.target.value })}>
                    {app.facultados.map((f) => <option key={f.id} value={f.id}>{f.nombre} · {f.cargo}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="mt-5 border-l-[3px] px-4 py-3" style={{ borderColor: 'var(--calibre)', background: 'rgba(22,163,74,.05)' }}>
                <p className="text-[12px] leading-relaxed">
                  La marca original no se toca: esto crea un registro <strong>nuevo y distinto</strong>, con el sello
                  de cuándo se asentó, la hora que se declara, el motivo y la firma de quien autoriza. En los
                  reportes aparece señalada y nunca se confunde con una checada biométrica.
                </p>
              </div>
              {leyendo ? (
                <div className="mt-6 flex items-center gap-3 border px-4 py-4" style={{ borderColor: 'var(--tinta)', background: 'var(--pergamino)' }}>
                  <span className="tick" style={{ color: 'var(--tinta)' }}><Huella size={30} /></span>
                  <div>
                    <div className="text-[13px] font-bold">Esperando la huella de quien autoriza</div>
                    <div className="mono text-[10.5px]" style={{ color: 'var(--grafito)' }}>
                      sin firma biométrica el asiento no se guarda
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex gap-2">
                  <Btn tone="tinta" onClick={confirmar} disabled={!form.motivo.trim() || !form.facultadoId}>
                    Firmar con huella y asentar
                  </Btn>
                  <Btn tone="grafito" ghost onClick={() => setAsiento(null)}>Cancelar</Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}