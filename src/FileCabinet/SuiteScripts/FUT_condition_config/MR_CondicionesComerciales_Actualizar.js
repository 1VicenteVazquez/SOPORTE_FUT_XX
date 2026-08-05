/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * MR_CondicionesComerciales_Actualizar.js
 *
 * Recibe el JSON de cambios enviado desde SL_CondicionesComerciales_VistaB
 * y crea o actualiza los registros customrecord_fut_condiciones_comerciales
 * correspondientes.
 *
 * Parámetros de script (crear como Script Parameters en el registro del
 * Map/Reduce, tipo Free-Form Text / Long Text):
 *   custscript_mr_cc_proveedor -> internal id del Proveedor
 *   custscript_mr_cc_marca     -> internal id de la Marca
 *   custscript_mr_cc_cambios   -> JSON.stringify([{ id, item, activo, prontoPago, rebate, crecimiento }, ...])
 */
define(['N/record', 'N/runtime', 'N/log'], (record, runtime, log) => {

    const CUSTOM_RECORD_ID = 'customrecord_fut_condiciones_comerciales';

    const FIELD = {
        PROVEEDOR: 'custrecord_cc_proveedor',
        MARCA: 'custrecord_cc_marca',
        ARTICULO: 'custrecord_cc_articulo',
        ACTIVO: 'custrecord_cc_activo',
        PRONTO_PAGO: 'custrecord_cc_pronto_pago',
        REBATE: 'custrecord_cc_rebate',
        CRECIMIENTO: 'custrecord_cc_crecimiento'
    };

    const getInputData = () => {
        const script = runtime.getCurrentScript();
        const proveedorId = script.getParameter({ name: 'custscript_mr_cc_proveedor' });
        const marcaId = script.getParameter({ name: 'custscript_mr_cc_marca' });
        const cambiosRaw = script.getParameter({ name: 'custscript_mr_cc_cambios' });

        let cambios = [];
        try {
            cambios = cambiosRaw ? JSON.parse(cambiosRaw) : [];
        } catch (e) {
            log.error('Error parseando parámetro de cambios', e.message);
        }

        // Se agrega proveedorId/marcaId a cada línea para poder crear
        // registros nuevos en la fase map sin depender de estado global.
        return cambios.map((c) => Object.assign({}, c, { proveedorId, marcaId }));
    };

    const map = (context) => {
        const cambio = JSON.parse(context.value);

        try {
            if (cambio.id) {
                // Actualizar registro existente
                record.submitFields({
                    type: CUSTOM_RECORD_ID,
                    id: cambio.id,
                    values: {
                        [FIELD.ACTIVO]: cambio.activo,
                        [FIELD.PRONTO_PAGO]: cambio.prontoPago,
                        [FIELD.REBATE]: cambio.rebate,
                        [FIELD.CRECIMIENTO]: cambio.crecimiento
                    },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });

                context.write({ key: String(cambio.id), value: 'updated' });
            } else {
                // Crear nuevo registro
                const nuevoRegistro = record.create({ type: CUSTOM_RECORD_ID, isDynamic: true });

                nuevoRegistro.setValue({ fieldId: FIELD.PROVEEDOR, value: cambio.proveedorId });
                nuevoRegistro.setValue({ fieldId: FIELD.MARCA, value: cambio.marcaId });
                nuevoRegistro.setValue({ fieldId: FIELD.ARTICULO, value: cambio.item });
                nuevoRegistro.setValue({ fieldId: FIELD.ACTIVO, value: cambio.activo });
                nuevoRegistro.setValue({ fieldId: FIELD.PRONTO_PAGO, value: cambio.prontoPago });
                nuevoRegistro.setValue({ fieldId: FIELD.REBATE, value: cambio.rebate });
                nuevoRegistro.setValue({ fieldId: FIELD.CRECIMIENTO, value: cambio.crecimiento });

                const newId = nuevoRegistro.save();

                context.write({ key: String(newId), value: 'created' });
            }
        } catch (e) {
            log.error({
                title: `Error procesando cambio - Artículo ${cambio.item}`,
                details: e.message
            });
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
            log.error({ title: `Error en fase Map - registro ${key}`, details: error });
            return true;
        });

        log.audit({
            title: 'Resumen Map/Reduce Condiciones Comerciales',
            details: `Creados: ${creados} | Actualizados: ${actualizados} | Errores: ${errores}`
        });
    };

    return { getInputData, map, summarize };
});