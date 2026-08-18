/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 *
 * MR_CondicionesComerciales_Actualizar.js
 */
define(['N/record', 'N/runtime', 'N/log'], (record, runtime, log) => {

    const CUSTOM_RECORD_HIJO = 'customrecord_fut_condicion_detalle';

    const FIELD_HIJO = {
        PADRE: 'custrecord_fut_condicion_individual',
        TIPO_CONDICION: 'custrecord_fut_tipo_condicion',
        ARTICULO: 'custrecord_fut_articulo',
        ACTIVO: 'custrecord_fut_activo',
        PORCENTAJE: 'custrecord_fut_porcentaje',
        DESCRIPCION: 'custrecord_fut_descripcion'
    };

    const getInputData = () => {
        const script = runtime.getCurrentScript();
        const padreId = script.getParameter({ name: 'custscript_mr_cc_padre_id' });
        const tipoCondicionId = script.getParameter({ name: 'custscript_mr_cc_tipo_id' });
        const cambiosRaw = script.getParameter({ name: 'custscript_mr_cc_cambios' });

        log.debug('MR getInputData - parámetros recibidos', `padreId: ${padreId} | cambiosRaw length: ${cambiosRaw ? cambiosRaw.length : 0}`);

        let cambios = [];
        try { cambios = cambiosRaw ? JSON.parse(cambiosRaw) : []; } catch (e) { }
        
        const cambiosConContexto = cambios.map(c => Object.assign({}, c, { padreId, tipoCondicionId }));
        
        log.audit('MR getInputData - registros que se van a procesar en map()', cambiosConContexto.length);
        
        return cambiosConContexto;
    };

    const map = (context) => {
        const cambio = JSON.parse(context.value);

        try {
            if (cambio.id) {
                // SOLUCIÓN AL CHECKBOX: Usar load() en lugar de submitFields()
                log.debug('MR map - ACTUALIZANDO registro existente', `id: ${cambio.id} | item: ${cambio.item} | Activo: ${cambio.activo}`);
                
                const recEdit = record.load({ type: CUSTOM_RECORD_HIJO, id: cambio.id });
                recEdit.setValue({ fieldId: FIELD_HIJO.ACTIVO, value: cambio.activo });
                recEdit.setValue({ fieldId: FIELD_HIJO.PORCENTAJE, value: cambio.porcentaje });
                recEdit.setValue({ fieldId: FIELD_HIJO.DESCRIPCION, value: cambio.descripcion });
                recEdit.save({ ignoreMandatoryFields: true });
                
                context.write({ key: String(cambio.id), value: 'updated' });
            } else {
                // Crear nuevo
                log.debug('MR map - CREANDO registro nuevo', `item: ${cambio.item} | Activo: ${cambio.activo}`);
                
                const recHijo = record.create({ type: CUSTOM_RECORD_HIJO });
                recHijo.setValue({ fieldId: 'name', value: `Detalle Condición - Art ${cambio.item}` }); 
                recHijo.setValue({ fieldId: FIELD_HIJO.PADRE, value: cambio.padreId });
                recHijo.setValue({ fieldId: FIELD_HIJO.TIPO_CONDICION, value: cambio.tipoCondicionId });
                recHijo.setValue({ fieldId: FIELD_HIJO.ARTICULO, value: cambio.item });
                recHijo.setValue({ fieldId: FIELD_HIJO.ACTIVO, value: cambio.activo });
                recHijo.setValue({ fieldId: FIELD_HIJO.PORCENTAJE, value: cambio.porcentaje });
                recHijo.setValue({ fieldId: FIELD_HIJO.DESCRIPCION, value: cambio.descripcion });

                const newId = recHijo.save();
                context.write({ key: String(newId), value: 'created' });
            }
        } catch (e) {
            log.error({ title: `MR map - Error en item ${cambio.item}`, details: e.message });
        }
    };

    const summarize = (summary) => {
        let creados = 0;
        let actualizados = 0;
        let errores = 0;

        summary.output.iterator().each((key, value) => {
            if (value === 'created') creados++;
            if (value === 'updated') actualizados++;
            return true;
        });

        summary.mapSummary.errors.iterator().each((key, error) => {
            errores++;
            log.error({ title: `MR summarize - Error en fase Map - registro ${key}`, details: error });
            return true;
        });

        log.audit({
            title: 'MR summarize - Resumen Map/Reduce Condiciones Comerciales',
            details: `Creados: ${creados} | Actualizados: ${actualizados} | Errores: ${errores} | Usage consumido: ${summary.mapSummary.usage} | Tiempo total: ${summary.seconds}s`
        });
    };

    return { getInputData, map, summarize };
});