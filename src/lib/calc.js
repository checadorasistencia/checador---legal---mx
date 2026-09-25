import { ymd, minutosEntre, topeExtraDelAnio, jornadaDelAnio , diaLocal, inicioDia, finDia } from './time';
import { esperado, resolverTurno, claveSemana, DESCANSO } from './rol';
import { salarioEn, estaVigente } from './vigencia';

const ORDEN = ['entrada', 'comida_inicio', 'comida_fin', 'extra_inicio', 'extra_fin', 'salida'];

export const ETIQUETA = {
  entrada_asentada: 'Entrada asentada',
  salida_asentada: 'Salida asentada',
  entrada: 'Entrada',
  salida: 'Salida',
  comida_inicio: 'Salida a comer',
  comida_fin: 'Regreso de comer',
  extra_inicio: 'Inicia tiempo extra',
  extra_fin: 'Cierra tiempo extra',
};

export const CORTA = {
  entrada: 'entrada', salida: 'salida', comida_inicio: 'comida',
  comida_fin: 'regreso', extra_inicio: 'extra', extra_fin: 'cierra extra',
};

/* Dos familias distintas de incidencia:
   · AUSENCIA: el día entero no se espera a la persona (vacaciones, permiso,
     incapacidad, descanso). No genera falta ni alerta.
   · TOLERANCIA: la persona sí trabaja, pero se le concede un margen. Un
     imprevisto no debería costarle el día ni chocar con el bloqueo de
     marcado, así que estas mueven la regla solo para ese día. */
export const TIPO_INCIDENCIA = {
  vacaciones:      { label: 'Vacaciones',        color: 'var(--calibre)', familia: 'ausencia' },
  permiso:         { label: 'Permiso',           color: 'var(--grafito)', familia: 'ausencia' },
  incapacidad:     { label: 'Incapacidad',       color: 'var(--tinta)',   familia: 'ausencia' },
  descanso:        { label: 'Descanso',          color: 'var(--ambar)',   familia: 'ausencia' },
  /* Suspensión disciplinaria (art. 423 fr. X LFT). No es falta injustificada,
     pero tampoco se paga: es su propia categoría. Para ser válida necesita
     acta con causa, fecha y firma del trabajador, así que el motivo importa. */
  suspension:      { label: 'Suspensión',        color: 'var(--tinta)',   familia: 'ausencia',
                     largo: 'Suspensión disciplinaria', sinPago: true },
  llegada_tarde:   { label: 'Llegada tarde',     color: 'var(--ambar)',   familia: 'tolerancia',
                     largo: 'Permiso para llegar tarde' },
  salida_temprano: { label: 'Salida antes',       color: 'var(--ambar)',   familia: 'tolerancia',
                     largo: 'Permiso de salida anticipada' },
  jornada_abierta: { label: 'Sin límite',         color: 'var(--ambar)',   familia: 'tolerancia',
                     largo: 'Marcado sin límite de hora' },
};

export const esAusencia   = (tipo) => TIPO_INCIDENCIA[tipo]?.familia === 'ausencia';
export const esTolerancia = (tipo) => TIPO_INCIDENCIA[tipo]?.familia === 'tolerancia';

// Una marca posterior al cierre del turno no es un retardo de mil minutos:
// es una marca fuera del horario asignado, y así hay que llamarla.
export function retardoDe(turno, iso, anclaDia) {
  const v = ventanaDeTurno(turno, anclaDia ?? iso);
  if (!v) return { min: 0, fuera: false };
  const t = new Date(iso);
  if (t.getTime() > v.fin.getTime()) return { min: 0, fuera: true };
  return { min: Math.max(0, Math.round((t - v.ini) / 60000)), fuera: false };
}

/* Ventana esperada de una jornada. El ancla es el DÍA EN QUE INICIA el
   turno, nunca el día de la marca: un turno 18:00→01:00 termina de madrugada,
   y si se anclara en la fecha de la salida el fin quedaría 24 h después. */
/* Convierte 'HH:MM' en horas y minutos, o null si la cadena no sirve.

   EL CHOQUE QUE ESTO EVITA: antes se hacía turno.entrada.split(':') a secas.
   Un turno guardado sin horario (el encargado abre el editor, teclea el
   nombre y guarda) o traído de un respaldo incompleto hacía que .split
   explotara sobre undefined. Y no tumbaba solo el reporte: esta función la
   usa el kiosco, así que un turno mal capturado dejaba a TODO EL PERSONAL
   sin poder checar, con la pantalla en blanco y sin explicación. */
export function horaMin(hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

export function ventanaDeTurno(turno, anclaDia) {
  if (!turno) return null;
  const e = horaMin(turno.entrada);
  const sa = horaMin(turno.salida);
  /* Sin horario no hay ventana. Devolver null es lo correcto: el resto del
     código ya sabe tratar un turno sin ventana como «sin horario contra el
     que medir», que es exactamente lo que es. */
  if (!e || !sa) return null;
  const base = inicioDia(anclaDia);
  if (Number.isNaN(base.getTime())) return null;
  const [he, me] = [e.h, e.min];
  const [hs, ms] = [sa.h, sa.min];
  const ini = new Date(base); ini.setHours(he, me, 0, 0);
  const fin = new Date(base); fin.setHours(hs, ms, 0, 0);
  if (fin <= ini) fin.setDate(fin.getDate() + 1);   // cruza medianoche
  return { ini, fin, cruzaMedianoche: fin.getDate() !== ini.getDate() };
}

/* Diferencia entre la salida real y la programada. Positiva es tiempo
   extraordinario (nadie marca «empiezo mis extras», se queda y ya);
   negativa es una jornada recortada, que sin detectar se pagaba completa. */
export function difSobreTurno(turno, isoSalida, anclaDia) {
  const v = ventanaDeTurno(turno, anclaDia ?? isoSalida);
  if (!v || !isoSalida) return 0;
  return Math.round((new Date(isoSalida) - v.fin) / 60000);
}
export const excesoSobreTurno = (turno, iso, ancla) => Math.max(0, difSobreTurno(turno, iso, ancla));

/* Minutos trabajados ANTES de la hora de entrada. La ley no distingue si el
   exceso ocurre antes o después del turno: en ambos casos es tiempo
   extraordinario. Sin esto, llegar tres horas antes inflaba las ordinarias. */
export function anticipoSobreTurno(turno, isoEntrada, anclaDia) {
  const v = ventanaDeTurno(turno, anclaDia ?? isoEntrada);
  if (!v || !isoEntrada) return 0;
  return Math.max(0, Math.round((v.ini - new Date(isoEntrada)) / 60000));
}

/* Días de descanso obligatorio del art. 74 de la LFT. Trabajarlos se paga
   doble además del salario del día (art. 75).

   OJO: tres de los siete son lunes flotantes, no fechas fijas. La reforma
   DOF 17-01-2006 movió Constitución al primer lunes de febrero, Natalicio de
   Juárez al tercer lunes de marzo, y Revolución al tercer lunes de noviembre.
   Usar fechas fijas da resultados correctos solo por coincidencia en ciertos
   años: en 2027, por ejemplo, los tres caen en días distintos. */
const FIJOS = {
  '01-01': 'Año nuevo',
  '05-01': 'Día del trabajo',
  '09-16': 'Independencia',
  '12-25': 'Navidad',
};

/* Enésimo lunes del mes. n=1 → primero, n=3 → tercero. */
function nesimoLunes(anio, mes, n) {
  const d = new Date(anio, mes - 1, 1);
  const offset = (8 - d.getDay()) % 7;          // días hasta el primer lunes
  d.setDate(1 + offset + (n - 1) * 7);
  return d;
}

export function festivoDe(fecha) {
  /* diaLocal y no new Date: con una cadena 'YYYY-MM-DD' el motor la leería
     como UTC y el 16 de septiembre se convertiría en 15. El festivo no se
     detectaba y el día no se pagaba doble. */
  const d = diaLocal(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const mm = d.getMonth() + 1, dd = d.getDate(), y = d.getFullYear();
  const clave = `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  if (FIJOS[clave]) return FIJOS[clave];

  // Lunes flotantes (reforma 2006)
  const eq = (ref) => ref.getFullYear() === y && ref.getMonth() === d.getMonth() && ref.getDate() === dd;
  if (eq(nesimoLunes(y, 2, 1))) return 'Aniversario de la Constitución';
  if (eq(nesimoLunes(y, 3, 3))) return 'Natalicio de Benito Juárez';
  if (eq(nesimoLunes(y, 11, 3))) return 'Aniversario de la Revolución';
  return null;
}

/* Para la interfaz: lista de festivos del año, con sus fechas reales. */
export function festivosDelAnio(anio) {
  return [
    ['01-01', 'Año nuevo'],
    [nesimoLunes(anio, 2, 1), 'Aniversario de la Constitución'],
    [nesimoLunes(anio, 3, 3), 'Natalicio de Benito Juárez'],
    ['05-01', 'Día del trabajo'],
    ['09-16', 'Independencia'],
    [nesimoLunes(anio, 11, 3), 'Aniversario de la Revolución'],
    ['12-25', 'Navidad'],
  ];
}
/* Prima dominical del art. 71. Con new Date() y una cadena de fecha, un
   domingo se leía como sábado y la prima no se pagaba nunca. */
export const esDomingo = (fecha) => diaLocal(fecha).getDay() === 0;

/* ¿Esta marca cae dentro de la ventana permitida? El límite se mide desde el
   fin del turno que el rol asignó ese día, no desde una hora fija por
   persona: con horarios rotativos una hora fija no significa nada. */
export function ventanaAbierta(turno, minutosTrasCierre, ahora = new Date(), permiso = null, anclaDia = null) {
  if (!turno) return { abierta: true, limite: null };
  // Un permiso de marcado sin límite abre la ventana ese día completo.
  if (permiso?.tipo === 'jornada_abierta') return { abierta: true, limite: null, permiso };
  const v = ventanaDeTurno(turno, anclaDia ?? ahora);
  const extra = permiso?.tipo === 'llegada_tarde' ? (permiso.minutos ?? 60) : 0;
  const limite = new Date(v.fin.getTime() + (minutosTrasCierre + extra) * 60000);
  return { abierta: ahora <= limite, limite, fin: v.fin, permiso: permiso ?? null };
}

/* Evalúa si una incidencia cubre un día concreto.
   Las incidencias nuevas guardan fechas absolutas (YYYY-MM-DD). Las
   antiguas (creadas antes de la corrección) todavía pueden tener offsets
   numéricos relativos a hoy, así que se soportan ambos formatos. */
function vigenteEse(incidencias, empId, fecha, filtro) {
  const f = inicioDia(fecha);
  return incidencias.find((i) => {
    if (i.empId !== empId || i.cancelada) return false;
    if (filtro && !filtro(i.tipo)) return false;
    const abs = (v) => {
      if (typeof v === 'string') { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
      // Compat: offsets numéricos relativos a hoy (formato viejo).
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + v); return d;
    };
    return f >= abs(i.desde) && f <= abs(i.hasta);
  });
}

/* Ausencias: el día no se espera a la persona. */
export const incidenciaEn = (incidencias, empId, fecha) =>
  vigenteEse(incidencias, empId, fecha, esAusencia);

/* Permisos de tolerancia: la persona trabaja, con margen concedido. */
export const toleranciaEn = (incidencias, empId, fecha) =>
  vigenteEse(incidencias, empId, fecha, esTolerancia);

// Una jornada = todas las marcas de un empleado en un día, más lo que la ley exige medir.
export function jornadas({ registros, empleados, turnos, incidencias, rol = {}, publicadas = [], inicioSemana = 1, toleranciaGlobal = 10, toleranciaAnticipoMin = 20, desde, hasta, sucursal = 'todas' }) {
  /* Los extremos del periodo vienen de un <input type="date">, o sea cadenas
     'YYYY-MM-DD'. Con new Date() el rango se corría un día hacia atrás: una
     quincena del 1 al 15 calculaba del 31 al 14, el día 15 no se pagaba y el
     31 se pagaba dos veces. */
  const d0 = inicioDia(desde);
  const d1 = finDia(hasta);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return [];
  const emps = empleados.filter((e) => sucursal === 'todas' || e.sucursalId === sucursal);
  const out = [];

  /* ── ÍNDICE DE MARCAS ──────────────────────────────────────────────────
     Este índice arregla un problema de raíz, no de estilo.

     Antes, adentro de los dos bucles (empleado × día) se hacía un
     registros.filter() que recorría la base COMPLETA. El costo era
     empleados × días × marcas: con 12 personas, un reporte de un año y 17
     mil marcas, son 74 millones de comparaciones y la app se queda tiesa
     varios segundos. Con cinco años de operación —que es lo que la ley
     obliga a conservar— pasa de segundos a decenas de segundos y el patrón
     cree que se trabó.

     Se indexa una sola vez por empleado y por día. El costo baja a las
     marcas más lo que de verdad se consulta, y un reporte de un año pasa a
     ser instantáneo sin importar cuántos años lleve acumulados. */
  const porEmp = new Map();       // empId → marcas ordenadas por hora
  const porEmpDia = new Map();    // `empId|dia` → marcas de ese día
  for (const r of registros) {
    if (!porEmp.has(r.empId)) porEmp.set(r.empId, []);
    porEmp.get(r.empId).push(r);
    const k = `${r.empId}|${r.dia}`;
    if (!porEmpDia.has(k)) porEmpDia.set(k, []);
    porEmpDia.get(k).push(r);
  }
  /* Ordenadas por el sello, no por el orden de inserción: un respaldo
     importado o una marca asentada pueden llegar fuera de secuencia, y el
     cálculo de la jornada depende de cuál marca va primero. */
  const ts = (r) => new Date(r.tsCenam).getTime();
  for (const lista of porEmp.values()) lista.sort((a, b) => ts(a) - ts(b));

  /* Las marcas de una jornada nocturna caen en dos fechas. Se buscan por
     ventana de tiempo, pero solo entre las de ESE empleado y solo en los dos
     días que pueden aportar: el del turno y el siguiente. */
  const marcasEnVentana = (empId, dia, vent) => {
    const delDia = porEmpDia.get(`${empId}|${dia}`) ?? [];
    if (!vent) return [...delDia].sort((a, b) => ts(a) - ts(b));
    /* Un turno que termina a las 22:00 no cruza medianoche, pero una salida
       a las 00:30 SÍ cae en el día siguiente. La ventana de búsqueda se
       extiende 4 h después de la salida programada; si ese límite ya es
       otro día, hay que buscar también en las marcas de mañana. */
    const finConMargen = vent.fin.getTime() + 4 * 3600000;
    const cruza = new Date(finConMargen).getDate() !== vent.ini.getDate();
    if (!cruza) return [...delDia].sort((a, b) => ts(a) - ts(b));
    const sig = diaLocal(dia); sig.setHours(12, 0, 0, 0);
    sig.setDate(sig.getDate() + 1);
    const delSig = porEmpDia.get(`${empId}|${ymd(sig)}`) ?? [];
    const ini = vent.ini.getTime();
    const extra = delSig.filter((r) => { const t = ts(r); return t > ini && t <= finConMargen; });
    return [...delDia, ...extra].sort((a, b) => ts(a) - ts(b));
  };

  for (const emp of emps) {
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const dia = ymd(d);
      // Fuera de la relación laboral no se evalúa nada: ni faltas antes del
      // alta, ni ausencias después de la baja.
      if (!estaVigente(emp, d)) continue;
      const esp = esperado(rol, publicadas, emp.id, d, inicioSemana);
      const turno = resolverTurno(esp.celda, turnos);
      const programado = esp.estado === 'trabaja';
      const sinRol = esp.estado === 'sin_rol';
      const descanso = esp.estado === 'descanso';
      const inc = incidenciaEn(incidencias, emp.id, d);
      /* Las marcas de una jornada nocturna caen en dos fechas distintas. Se
         recogen las del día y, si el turno cruza medianoche, también las de la
         madrugada siguiente que caen dentro de la ventana del turno. */
      const vent = ventanaDeTurno(turno, d);
      const marcas = marcasEnVentana(emp.id, dia, vent);

      /* Si estas marcas ya fueron absorbidas por la jornada nocturna del día
         anterior, no se vuelven a contar aquí. Esto aplica siempre que el
         día anterior tuvo turno nocturno, tenga o no turno el día actual:
         la salida de las 06:00 es del turno de ayer, no del de hoy. */
      const anterior = new Date(d); anterior.setDate(anterior.getDate() - 1);
      const espAnt = esperado(rol, publicadas, emp.id, anterior, inicioSemana);
      const ventAnt = espAnt.estado === 'trabaja' ? ventanaDeTurno(resolverTurno(espAnt.celda, turnos), anterior) : null;
      /* La absorción aplica cuando la ventana de ayer, con su margen de 4 h,
         se extiende hasta hoy: un turno 14-22 con salida a las 00:30 deja
         esa marca en la madrugada de hoy, y no es de hoy. */
      const ventAntConMargen = ventAnt && (ventAnt.fin.getTime() + 4 * 3600000) > new Date(d).setHours(0, 0, 0, 0);
      if (ventAntConMargen) {
        /* Se separan las marcas: las de la madrugada (hasta 4 h después de
           la salida programada de ayer) son de ayer; las demás son de hoy. */
        const limite = ventAnt.fin.getTime() + 4 * 3600000;
        const deAyer = marcas.filter((r) => new Date(r.tsCenam).getTime() <= limite);
        const deHoy = marcas.filter((r) => new Date(r.tsCenam).getTime() > limite);
        if (!programado && deHoy.length === 0 && deAyer.length > 0) continue;
        /* Si el día SÍ tiene turno, se quedan solo las marcas que no son de
           la madrugada del turno anterior. */
        if (programado && deAyer.length > 0) {
          marcas.length = 0;
          marcas.push(...deHoy);
        }
      }

      if (!programado && !marcas.length) continue;
      if (inc) { out.push({ emp, turno, dia, fecha: new Date(d), incidencia: inc, marcas: [], programado, descanso, sinRol }); continue; }

      const byTipo = {};
      for (const m of marcas) if (!byTipo[m.tipo]) byTipo[m.tipo] = m;

      /* Una marca asentada vale como la marca que suple, pero conserva su
         identidad: el cálculo usa la hora declarada y el reporte la distingue
         de una checada biométrica. */
      const suplida = (base) => {
        const real = byTipo[base];
        if (real) return real;
        const as = byTipo[`${base}_asentada`];
        return as ? { ...as, tsCenam: as.horaDeclarada, esAsentada: true } : undefined;
      };
      const entrada = suplida('entrada'), salida = suplida('salida');

      const tol = toleranciaEn(incidencias, emp.id, d);
      const graciaMin = tol?.tipo === 'llegada_tarde' ? (tol.minutos ?? 60) : 0;
      const ret = entrada ? retardoDe(turno, entrada.tsCenam, d) : { min: 0, fuera: false };
      const retardoMin = Math.max(0, ret.min - graciaMin);
      const tolerancia = turno?.tolerancia ?? toleranciaGlobal;
      /* Comida: si salió a comer y no marcó el regreso, no se puede saber
         cuánto duró. Antes daba 0 y el descanso completo se pagaba como
         trabajado; ahora se descuenta la duración programada del turno y se
         señala, que es lo defendible. */
      const comidaCerrada = Boolean(byTipo.comida_inicio && byTipo.comida_fin);
      const comidaProgramada = turno && turno.conComida !== false && turno.comidaIni && turno.comidaFin
        ? Math.max(0, (() => {
            const ci = horaMin(turno.comidaIni), cf = horaMin(turno.comidaFin);
            if (!ci || !cf) return 0;
            const [a, b] = [ci.h, ci.min];
            const [c, dd] = [cf.h, cf.min];
            return (c * 60 + dd) - (a * 60 + b);
          })())
        : 0;
      const comidaMin = comidaCerrada
        ? minutosEntre(byTipo.comida_inicio.tsCenam, byTipo.comida_fin.tsCenam)
        : (byTipo.comida_inicio ? comidaProgramada : 0);
      const comidaAbierta = Boolean(byTipo.comida_inicio) && !comidaCerrada;

      /* ── La jornada arranca en la hora del turno, no en la marca ─────
         El personal llega junto en el camión media hora antes y checa de
         una vez, porque pararlos para que regresen a su hora exacta no
         tiene sentido. Esa media hora no es jornada: la marca guarda su
         hora real (dato firmado, intocable) pero el tiempo trabajado se
         cuenta desde que empieza el turno.

         Sin esto, 30 minutos diarios de anticipo se convertían en 10 horas
         extra al mes por empleado que nadie ordenó ni trabajó. */
      const anticipoBruto = anticipoSobreTurno(turno, entrada?.tsCenam, d);
      const descontarAnticipo = entrada && salida && turno ? anticipoBruto : 0;

      const brutoMin = entrada && salida
        ? Math.max(0, minutosEntre(entrada.tsCenam, salida.tsCenam) - descontarAnticipo)
        : 0;
      const netoMin = Math.max(0, brutoMin - comidaMin);

      /* Extras: se respetan las marcas explícitas si existen; si no, se deducen
         del exceso sobre la salida programada. El umbral de 15 min evita
         convertir en extra el minuto que alguien tardó en llegar al lector. */
      const extraExplicito = byTipo.extra_inicio && byTipo.extra_fin
        ? minutosEntre(byTipo.extra_inicio.tsCenam, byTipo.extra_fin.tsCenam) : 0;
      const dif = difSobreTurno(turno, salida?.tsCenam, d);
      const despuesMin = dif >= 15 ? dif : 0;
      // El anticipo solo cuenta como extra si la jornada llegó a cerrarse:
      // si no hay salida, no hay con qué medir nada.
      /* ── ANTICIPO: el bug más caro de este archivo ──────────────────
         Antes, TODO el tiempo antes del turno se computaba como
         extraordinario en cuanto pasaba de 15 minutos. En un restaurante
         donde el personal llega junto en el camión media hora antes, eso
         fabricaba unas 10 horas extra al mes POR EMPLEADO, de la nada y sin
         que nadie hubiera trabajado un minuto de más.

         El art. 66 de la LFT exige que el tiempo extraordinario sea
         ordenado por el patrón. Estar en el local antes de tu turno porque
         ahí te dejó el camión no es jornada.

         Lo que hace ahora:
           · La marca conserva SIEMPRE su hora real. Es el dato firmado en
             la cadena y no se toca jamás: si la app guardara una hora
             distinta a la que leyó el lector, dejaría de ser prueba.
           · La jornada se cuenta desde la hora del turno.
           · Dentro de la tolerancia (20 min por defecto): no computa nada.
           · Fuera de la tolerancia: se señala en el reporte para que el
             patrón decida, pero NO se paga solo. */
      const anticipo = anticipoBruto;
      const anticipoComputa = anticipo > toleranciaAnticipoMin;
      const antesMin = 0;      // el anticipo nunca entra solo a la bolsa de extras
      const extraMin = extraExplicito || despuesMin;

      /* Salida anticipada: se fue antes de su hora. Si trae permiso queda
         autorizada; si no, el reporte lo señala para que el patrón decida. */
      const faltanteMin = dif <= -15 ? Math.abs(dif) : 0;
      const salidaAutorizada = tol?.tipo === 'salida_temprano';

      const festivo = festivoDe(d);
      const domingo = esDomingo(d);

      out.push({
        emp, turno, dia, fecha: new Date(d), programado, descanso, sinRol,
        marcas: marcas.slice().sort((a, b) => {
          const base = (t) => ORDEN.indexOf(String(t).replace('_asentada', ''));
          return base(a.tipo) - base(b.tipo);
        }),
        entrada, salida, retardoMin, tolerancia,
        esRetardo: !ret.fuera && retardoMin > tolerancia,
        fueraDeHorario: ret.fuera,
        /* Solo es falta si el rol lo tenía programado. Si descansaba, si nadie
           publicó la semana, o si es festivo del art. 74 (donde el descanso es
           un derecho), no se le puede imputar una ausencia injustificada. */
        esFalta: programado && !entrada && !festivo,
        descansoObligatorio: Boolean(festivo) && programado && !entrada,
        marcaEnDescanso: descanso && marcas.length > 0,
        /* En curso: el turno aún no termina, es lo normal a media jornada.
           Colgada: el turno ya cerró (con su margen) y nadie marcó salida,
           que sí es una anomalía y hay que resolverla antes de la nómina. */
        enCurso: !!entrada && !salida && Boolean(vent) && Date.now() <= vent.fin.getTime() + 60 * 60000,
        abierta: !!entrada && !salida && !(vent && Date.now() <= vent.fin.getTime() + 60 * 60000),
        comidaMin, netoMin, permiso: tol ?? null, graciaMin,
        festivo, domingo, extraDeducido: !extraExplicito && extraMin > 0,
        faltanteMin, salidaAutorizada, salioAntes: faltanteMin > 0 && !salidaAutorizada,
        antesMin, despuesMin, anticipoMin: anticipo,
        /* Señalado para que el encargado lo revise, no pagado en automático. */
        anticipoComputa, anticipoTolerado: anticipo > 0 && !anticipoComputa,
        comidaAbierta, comidaEstimada: comidaAbierta ? comidaProgramada : 0,
        asentadas: marcas.filter((m) => m.tipo.endsWith('_asentada')),
        ordinarioMin: Math.max(0, netoMin - extraMin),
        extraMin,
        sinNtp: marcas.some((m) => !m.ntpOk),
      });
    }
  }
  out.sort((a, b) => (a.dia === b.dia ? a.emp.num.localeCompare(b.emp.num) : a.dia.localeCompare(b.dia)));
  return out;
}

export const PRIMA_DOMINICAL = 0.25;   // art. 71: 25% por lo menos

export function resumenPorEmpleado(js, { horasExtraActivas = true, inicioSemana = 1 } = {}) {
  const map = new Map();
  /* El tope de extras al doble se cuenta POR SEMANA (art. 66), no por
     periodo, así que las extras se acumulan por semana calendario y el
     tope se aplica a cada una. El año se toma de la jornada, no de hoy,
     porque un corte puede cruzar el 1 de enero y ahí cambia el tope. */
  const porSemana = new Map();   // empId → Map(claveSemana → minutos)
  const anioDe = (f) => new Date(f).getFullYear();
  for (const j of js) {
    if (!map.has(j.emp.id)) {
      map.set(j.emp.id, {
        emp: j.emp, dias: 0, faltas: 0, retardos: 0, minRetardo: 0,
        ordinarioMin: 0, extraMin: 0, incidencias: 0, abiertas: 0, sinNtp: 0,
        enDescanso: 0, domingos: 0, festivos: 0, salidasAntes: 0, minFaltante: 0,
        sinRolConMarca: 0, descansoObligatorio: 0, comidasAbiertas: 0, enCurso: 0,
        suspensiones: 0, conAsiento: 0, descansos: 0, porTipo: {}, pagoDias: 0, pagoPrima: 0, pagoFest: 0, extraPagoBase: 0,
        minSalario: null, maxSalario: 0,
        extraAntesMin: 0, extraDespuesMin: 0,
      });
    }
    const a = map.get(j.emp.id);
    if (j.incidencia) {
      a.incidencias++;
      a.porTipo[j.incidencia.tipo] = (a.porTipo[j.incidencia.tipo] ?? 0) + 1;
      if (TIPO_INCIDENCIA[j.incidencia.tipo]?.sinPago) a.suspensiones++;
      continue;
    }
    if (j.descanso && !j.marcas.length) { a.descansos++; continue; }
    if (j.esFalta) { a.faltas++; continue; }
    if (j.descansoObligatorio) { a.descansoObligatorio++; continue; }
    if (j.marcaEnDescanso) a.enDescanso++;
    if (j.sinRol && j.marcas.length) a.sinRolConMarca++;
    if (j.salioAntes) { a.salidasAntes++; a.minFaltante += j.faltanteMin; }
    if (j.comidaAbierta) a.comidasAbiertas++;
    if (j.asentadas?.length) a.conAsiento++;
    if (horasExtraActivas) { a.extraAntesMin += j.antesMin ?? 0; a.extraDespuesMin += j.despuesMin ?? 0; }
    if (j.entrada) {
      a.dias++;
      /* El salario se toma del día trabajado, no del vigente hoy: así un
         aumento no reescribe lo que ya se pagó en periodos cerrados. */
      const sal = salarioEn(j.emp, j.fecha);
      a.pagoDias += sal;
      a.minSalario = a.minSalario === null ? sal : Math.min(a.minSalario, sal);
      a.maxSalario = Math.max(a.maxSalario, sal);
      if (j.domingo) { a.domingos++; a.pagoPrima += sal * PRIMA_DOMINICAL; }
      if (j.festivo) { a.festivos++; a.pagoFest += sal; }
      a.extraPagoBase += sal / 8;       // para prorratear las extras
    }
    if (j.esRetardo) { a.retardos++; a.minRetardo += j.retardoMin; }
    if (j.abierta) a.abiertas++;
    if (j.enCurso) a.enCurso++;
    if (j.sinNtp) a.sinNtp++;
    a.ordinarioMin += j.ordinarioMin;
    const extraDia = horasExtraActivas ? j.extraMin : 0;
    a.extraMin += extraDia;
    if (extraDia > 0) {
      if (!porSemana.has(j.emp.id)) porSemana.set(j.emp.id, new Map());
      const sem = porSemana.get(j.emp.id);
      const k = claveSemana(j.fecha, inicioSemana);
      const acc = sem.get(k) ?? { min: 0, anio: anioDe(j.fecha) };
      sem.set(k, { min: acc.min + extraDia, anio: acc.anio });
    }
    // Jornada ordinaria por semana, para vigilar el máximo del año.
    if (!a.ordPorSemana) a.ordPorSemana = new Map();
    const ks = claveSemana(j.fecha, inicioSemana);
    const accOrd = a.ordPorSemana.get(ks) ?? { min: 0, anio: anioDe(j.fecha) };
    a.ordPorSemana.set(ks, { min: accOrd.min + j.ordinarioMin, anio: accOrd.anio });
    a.anio = anioDe(j.fecha);
  }
  return [...map.values()].map((a) => {
    const anio = a.anio ?? new Date().getFullYear();
    const topeSem = topeExtraDelAnio(anio) * 60;
    const maxSem = jornadaDelAnio(anio) * 60;

    /* Tope aplicado semana por semana (art. 66) y con el tope del año de ESA
       semana: un corte que cruza el 31 de diciembre tiene dos topes distintos,
       porque la reforma los sube cada 1 de enero hasta 2030. */
    let dobles = 0, triples = 0, semanasConExceso = 0;
    for (const { min: minutos, anio: anioSem } of (porSemana.get(a.emp.id)?.values() ?? [])) {
      const tope = topeExtraDelAnio(anioSem) * 60;
      dobles += Math.min(minutos, tope);
      const sobra = Math.max(0, minutos - tope);
      triples += sobra;
      if (sobra > 0) semanasConExceso++;
    }

    // Semanas donde la jornada ordinaria pasó del máximo de su propio año.
    let semanasSobreJornada = 0, peorSemanaMin = 0;
    for (const { min: minutos, anio: anioSem } of (a.ordPorSemana?.values() ?? [])) {
      if (minutos > jornadaDelAnio(anioSem) * 60) semanasSobreJornada++;
      if (minutos > peorSemanaMin) peorSemanaMin = minutos;
    }

    // Valor de la hora promediado sobre los días realmente trabajados, para
    // que un aumento a media quincena se refleje proporcionalmente.
    const porHora = a.dias > 0 ? a.extraPagoBase / a.dias : salarioEn(a.emp, new Date()) / 8;
    return {
      ...a, extraDoblesMin: dobles, extraTriplesMin: triples,
      semanasConExceso, semanasSobreJornada, peorSemanaMin, topeSemanalMin: topeSem, maxSemanalMin: maxSem,
      pagoOrdinario: a.pagoDias,
      pagoDobles: (dobles / 60) * porHora * 2,
      pagoTriples: (triples / 60) * porHora * 3,
      pagoPrimaDom: a.pagoPrima,
      pagoFestivos: a.pagoFest,   // el día ya va en ordinario: este es el segundo tanto
      salarioCambio: a.minSalario !== null && a.minSalario !== a.maxSalario,
      get total() {
        return this.pagoOrdinario + this.pagoDobles + this.pagoTriples
             + this.pagoPrimaDom + this.pagoFestivos;
      },
    };
  }).sort((x, y) => x.emp.num.localeCompare(y.emp.num));
}

export function estadoHoy({ registros, empleados, turnos, incidencias, rol = {}, publicadas = [], inicioSemana = 1, sucursal = 'todas' }) {
  const hoy = new Date();
  const js = jornadas({ registros, empleados, turnos, incidencias, rol, publicadas, inicioSemana, desde: hoy, hasta: hoy, sucursal });
  const ahora = Date.now();
  const presentes = [], retardos = [], ausentes = [], fuera = [], conIncidencia = [], descansoLey = [];

  for (const j of js) {
    if (j.incidencia) { conIncidencia.push(j); continue; }
    if (j.descansoObligatorio) { descansoLey.push(j); continue; }
    if (!j.programado) continue;
    if (j.entrada && !j.salida) (j.esRetardo ? retardos : presentes).push(j);
    else if (j.entrada && j.salida) fuera.push(j);
    else {
      const v = ventanaDeTurno(j.turno, j.fecha) ?? {
        ini: new Date(j.fecha), fin: new Date(new Date(j.fecha).setHours(23, 59, 0, 0)),
      };
      const esperado = v.ini;
      const cierre = v.fin;
      // Tres estados distintos, no uno: el turno todavía no empieza, el
      // turno está corriendo y no ha checado, o el turno ya cerró sin marca.
      const porEmpezar = ahora < esperado.getTime();
      ausentes.push({
        ...j,
        minutosTarde: Math.max(0, Math.round((ahora - esperado) / 60000)),
        minutosParaEntrar: porEmpezar ? Math.round((esperado.getTime() - ahora) / 60000) : 0,
        porEmpezar,
        ventanaAbierta: !porEmpezar && ahora <= cierre.getTime(),
        cerrado: !porEmpezar && ahora > cierre.getTime(),
      });
    }
  }
  return {
    presentes, retardos, ausentes, fuera, conIncidencia, descansoLey,
    festivo: festivoDe(hoy),
    jornadaMax: jornadaDelAnio(hoy.getFullYear()),
    rolPublicado: js.length > 0 ? !js[0].sinRol : true,
  };
}