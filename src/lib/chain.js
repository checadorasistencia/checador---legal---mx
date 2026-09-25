import { sha256, GENESIS } from './sha256';

/* VERSIÓN DEL ESQUEMA DE FIRMA. Va dentro del payload para que un peritaje
   sepa con qué regla se calculó cada hash, y para que un cambio futuro de
   esquema no haga parecer alterada una cadena legítima. */
export const ESQUEMA = 'v2';

/* Qué se firma y por qué:
   El hash debe cubrir no solo QUÉ pasó, sino también toda la evidencia de que
   la hora es confiable. Si tsLocal, deltaMs o ntpOk quedaran fuera, alguien
   podría cambiar «sin NTP» por «sincronizado», o maquillar la desviación del
   reloj, sin romper la cadena: justo el dato que un perito revisaría primero.
   El campo `dia` también se firma, porque de él dependen los cortes de los
   reportes: moverlo cambiaría a qué jornada pertenece la marca. */
const N = (v) => (v === undefined || v === null ? '' : String(v));

export function payloadRegistro(r) {
  return [
    ESQUEMA, N(r.seq), N(r.empId), N(r.tipo),
    N(r.tsCenam), N(r.tsLocal), N(r.deltaMs), N(r.rttMs),
    r.ntpOk ? '1' : '0', N(r.fuente), N(r.host),
    N(r.metodo), N(r.sucursalId), N(r.dia),
    /* Prueba de autoría: qué dedo generó la marca y con qué puntaje la
       reconoció el algoritmo. Sin esto, la cadena probaría que el dato no
       cambió, pero no quién lo puso ahí. */
    N(r.hashPlantilla), N(r.puntaje), N(r.margenMs),
    /* Una marca asentada por el encargado lleva firmado QUÉ hora se declaró,
       QUIÉN lo autorizó y POR QUÉ. Sin esto, el motivo podría cambiarse
       después sin romper la cadena. */
    N(r.horaDeclarada), N(r.asentadaPor), N(r.motivo), N(r.confirmadaConHuellaEmpleado),
    N(r.hashPrev),
  ].join('|');
}

export function payloadAuditoria(a) {
  return [
    ESQUEMA, N(a.seq), N(a.usuario), N(a.accion), N(a.entidad), N(a.campo),
    N(a.antes), N(a.despues), N(a.tsCenam), N(a.tsLocal), N(a.ip), N(a.hashPrev),
  ].join('|');
}

export function sellar(item, prevHash, payloadFn) {
  const withPrev = { ...item, hashPrev: prevHash };
  return { ...withPrev, hash: sha256(payloadFn(withPrev)) };
}

export function encadenar(items, payloadFn) {
  let prev = GENESIS;
  return items.map((it, i) => {
    const sealed = sellar({ ...it, seq: i + 1 }, prev, payloadFn);
    prev = sealed.hash;
    return sealed;
  });
}

/* Recorre la cadena completa y devuelve TODOS los eslabones roto, no solo el
   primero: un dictamen sirve si inventaria todo lo alterado. Distingue además
   el tipo de ruptura, que es información distinta para un perito:
     · contenido  → los datos ya no producen el hash almacenado
     · eslabón    → el hash anterior no corresponde al de la marca previa
     · secuencia  → el número de orden no es consecutivo (hay huecos) */
export function verificar(items, payloadFn) {
  let prev = GENESIS;
  const results = [];
  const rotos = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const esperado = sha256(payloadFn({ ...it, hashPrev: prev }));
    const contenidoOk = it.hash === esperado;
    const enlaceOk = it.hashPrev === prev;
    const secuenciaOk = Number(it.seq) === i + 1;
    const ok = contenidoOk && enlaceOk && secuenciaOk;
    const fila = {
      seq: it.seq, idx: i, ok, hash: it.hash, esperado,
      motivo: !enlaceOk ? 'eslabón' : !contenidoOk ? 'contenido' : !secuenciaOk ? 'secuencia' : null,
    };
    results.push(fila);
    if (!ok) rotos.push(fila);
    prev = it.hash;
  }
  return {
    results, rotos,
    rota: rotos.length ? rotos[0].idx : null,
    integra: rotos.length === 0,
    total: items.length,
  };
}

export const corto = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '—');
export { GENESIS };