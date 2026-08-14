/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 *
 * MR_AplicarEscalas.js
 */
define(['N/search', 'N/record', 'N/runtime', 'N/log'], (search, record, runtime, log) => {

    const CUSTOM_RECORD_DETALLE = 'customrecord_fut_condicion_detalle';
    const CUSTOM_RECORD_ESCALAS = 'customrecord_fut_escalas_meta';

    function getInputData() {
        const script = runtime.getCurrentScript();
        const marcaId = script.getParameter({ name: 'custscript2' });

        return search.create({
            type: search.Type.ITEM,
            filters: [
                ['custitem_nso_marca', 'anyof', marcaId], 'AND',
                ['isinactive', 'is', 'F'], 'AND',
                ['custitem_diametro_rin', 'isnotempty', '']
            ],
            columns: ['internalid', 'itemid', 'custitem_diametro_rin']
        });
    }

    // Extrae un número desde un valor de campo que puede venir como string plano,
    // objeto {value, text} o array de objetos {value, text}
    function extraerNumero(valorCampo) {
        if (valorCampo === null || valorCampo === undefined || valorCampo === '') return NaN;

        if (typeof valorCampo === 'object') {
            if (Array.isArray(valorCampo)) {
                if (valorCampo.length === 0) return NaN;
                valorCampo = valorCampo[0].text || valorCampo[0].value || '';
            } else {
                valorCampo = valorCampo.text || valorCampo.value || '';
            }
        }

        return parseFloat(String(valorCampo).replace(',', '.'));
    }

    function map(context) {
        const script = runtime.getCurrentScript();
        const padreId = script.getParameter({ name: 'custscript1' });
        const escalasJSON = script.getParameter({ name: 'custscript3' });
        const escalas = JSON.parse(escalasJSON || '[]'); // [{ min, max, descuentoNum }]

        const resultado = JSON.parse(context.value);
        const itemId = resultado.id;
        const itemCodigo = resultado.values['itemid'];
        const rinCrudo = resultado.values['custitem_diametro_rin'];
        const rinArticulo = extraerNumero(rinCrudo);

        if (isNaN(rinArticulo)) {
            // Diagnóstico: nos dice exactamente qué formato tiene el valor crudo
            log.error('Rin no parseable', {
                itemId, itemCodigo,
                rinCrudo,
                tipoRinCrudo: typeof rinCrudo,
                rinCrudoJSON: JSON.stringify(rinCrudo)
            });
            return;
        }

        const escala = escalas.find(e => rinArticulo >= e.min && rinArticulo <= e.max);

        if (!escala) {
            log.debug('Sin escala aplicable para este rin', { itemId, itemCodigo, rin: rinArticulo, escalasDisponibles: escalas });
            return;
        }

        log.debug('Escala encontrada', { itemId, itemCodigo, rin: rinArticulo, escalaEncontrada: escala });

        let detalleId = null;
        search.create({
            type: CUSTOM_RECORD_DETALLE,
            filters: [
                ['custrecord_fut_condicion_individual', 'anyof', padreId], 'AND',
                ['custrecord_fut_articulo', 'anyof', itemId]
            ]
        }).run().each(res => { detalleId = res.id; return false; });

        let rec = detalleId
            ? record.load({ type: CUSTOM_RECORD_DETALLE, id: detalleId })
            : record.create({ type: CUSTOM_RECORD_DETALLE });

        if (!detalleId) {
            rec.setValue({ fieldId: 'custrecord_fut_condicion_individual', value: padreId });
            rec.setValue({ fieldId: 'custrecord_fut_articulo', value: itemId });
        }

        rec.setValue({ fieldId: 'custrecord_fut_activo', value: true });
        rec.setValue({ fieldId: 'custrecord_fut_porcentaje', value: escala.descuentoNum });
        rec.setValue({ fieldId: 'custrecord_fut_descripcion', value: 'REBATE' });
        rec.save({ ignoreMandatoryFields: true });

        log.audit('Detalle actualizado', { itemId, itemCodigo, detalleId: detalleId || 'Nuevo', porcentaje: escala.descuentoNum });
    }

    function summarize(summary) {
        let errores = 0;

        summary.mapSummary.errors.iterator().each((key, error) => {
            errores++;
            log.error('Error en map', { key, error });
            return true;
        });

        log.audit('Resumen aplicación de escalas', {
            articulosEvaluados: summary.mapSummary.keysProcessed,
            errores: errores,
            duracionSegundos: Math.round(summary.seconds),
            usage: summary.usage,
            concurrency: summary.concurrency,
            yields: summary.yields
        });
    }

    return { getInputData, map, summarize };
});