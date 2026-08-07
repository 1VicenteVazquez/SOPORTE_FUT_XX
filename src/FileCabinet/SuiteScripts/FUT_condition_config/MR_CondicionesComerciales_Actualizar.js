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
 *
 * IMPORTANTE PARA DEBUG: estos logs salen en el Execution Log del
 * DEPLOYMENT DEL MAP/REDUCE, no en el de los Suitelets. Ve a
 * Customization > Scripting > Script Deployments > [deployment de
 * MR_CondicionesComerciales_Actualizar] > View Execution Log.
 */
define(['N/record', 'N/runtime', 'N/search', 'N/log'], (record, runtime, search, log) => {

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

        log.debug({
            title: 'MR getInputData - parámetros recibidos',
            details: `proveedorId: ${proveedorId} | marcaId: ${marcaId} | cambiosRaw length: ${cambiosRaw ? cambiosRaw.length : 'NULL/undefined'}`
        });

        if (!proveedorId || !marcaId || !cambiosRaw) {
            log.error({
                title: 'MR getInputData - FALTAN PARÁMETROS',
                details: 'proveedorId, marcaId o cambiosRaw llegaron vacíos. Revisa que el Map/Reduce tenga creados los Script Parameters custscript_mr_cc_proveedor, custscript_mr_cc_marca y custscript_mr_cc_cambios (Customization > Scripting > Scripts > [este script] > pestaña Parameters).'
            });
        }

        let cambios = [];
        try {
            cambios = cambiosRaw ? JSON.parse(cambiosRaw) : [];
        } catch (e) {
            log.error({ title: 'MR getInputData - Error parseando parámetro de cambios', details: e.message });
        }

        log.debug({
            title: 'MR getInputData - cambios parseados',
            details: `Total: ${cambios.length} | Contenido: ${JSON.stringify(cambios)}`
        });

        // Se agrega proveedorId/marcaId a cada línea para poder crear
        // registros nuevos en la fase map sin depender de estado global.
        const cambiosConContexto = cambios.map((c) => Object.assign({}, c, { proveedorId, marcaId }));

        log.audit({
            title: 'MR getInputData - registros que se van a procesar en map()',
            details: cambiosConContexto.length
        });

        return cambiosConContexto;
    };

    /**
     * El campo custrecord_cc_marca está configurado como "Sourced" desde
     * ARTÍCULO en NetSuite, pero ese sourcing automático NO se dispara de
     * forma confiable cuando el registro se crea por script en modo
     * estándar (solo funciona bien desde la UI real). Por eso se trae
     * aquí el valor real de custitem_nso_marca del Item y se setea a mano.
     */
    function obtenerMarcaDelItem(itemId) {
        try {
            const itemFields = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: ['custitem_nso_marca']
            });

            let marcaValue = itemFields.custitem_nso_marca;

            if (Array.isArray(marcaValue)) {
                marcaValue = marcaValue.length > 0 ? marcaValue[0].value : null;
            }

            log.debug({ title: 'MR obtenerMarcaDelItem', details: `itemId: ${itemId} | marca encontrada: ${marcaValue}` });

            return marcaValue || null;
        } catch (e) {
            log.error({ title: 'MR obtenerMarcaDelItem - Error', details: `itemId: ${itemId} | ${e.message}` });
            return null;
        }
    }

    const map = (context) => {
        const cambio = JSON.parse(context.value);

        log.debug({
            title: `MR map - procesando línea (índice ${context.key})`,
            details: JSON.stringify(cambio)
        });

        try {
            if (cambio.id) {
                // Actualizar registro existente
                log.debug({ title: 'MR map - ACTUALIZANDO registro existente', details: `id: ${cambio.id} | item: ${cambio.item}` });

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

                log.debug({ title: 'MR map - actualización exitosa', details: `id: ${cambio.id}` });

                context.write({ key: String(cambio.id), value: 'updated' });
            } else {
                // Crear nuevo registro
                log.debug({
                    title: 'MR map - CREANDO registro nuevo',
                    details: `proveedorId: ${cambio.proveedorId} | marcaId: ${cambio.marcaId} | item: ${cambio.item} | activo: ${cambio.activo} | prontoPago: ${cambio.prontoPago} | rebate: ${cambio.rebate} | crecimiento: ${cambio.crecimiento}`
                });

                // NOTA: se crea SIN isDynamic (modo estándar). En modo
                // dinámico, NetSuite simula el comportamiento del
                // formulario (sourcing/filtrado entre campos), y eso
                // estaba provocando que el valor de MARCA se perdiera al
                // guardar aunque se le hiciera setValue correctamente.
                // En modo estándar los valores se setean tal cual.
                const nuevoRegistro = record.create({ type: CUSTOM_RECORD_ID });

                // MARCA se trae explícitamente del Item (el sourcing
                // automático de NetSuite no es confiable al crear el
                // registro por script) y se setea a mano.
                const marcaReal = obtenerMarcaDelItem(cambio.item);

                if (!marcaReal) {
                    log.error({
                        title: 'MR map - Artículo sin Marca configurada',
                        details: `item: ${cambio.item} no tiene valor en custitem_nso_marca. El registro se va a crear sin Marca y NO va a aparecer en las búsquedas filtradas por Marca.`
                    });
                } else if (String(marcaReal) !== String(cambio.marcaId)) {
                    log.audit({
                        title: 'MR map - Marca del Artículo distinta a la Marca del filtro usado',
                        details: `item: ${cambio.item} | marca real del item: ${marcaReal} | marca del filtro (Vista A/B): ${cambio.marcaId}. Se guarda con la marca REAL del artículo.`
                    });
                }

                nuevoRegistro.setValue({ fieldId: FIELD.PROVEEDOR, value: cambio.proveedorId });
                nuevoRegistro.setValue({ fieldId: FIELD.ARTICULO, value: cambio.item });
                if (marcaReal) {
                    nuevoRegistro.setValue({ fieldId: FIELD.MARCA, value: marcaReal });
                }
                nuevoRegistro.setValue({ fieldId: FIELD.ACTIVO, value: cambio.activo });
                nuevoRegistro.setValue({ fieldId: FIELD.PRONTO_PAGO, value: cambio.prontoPago });
                nuevoRegistro.setValue({ fieldId: FIELD.REBATE, value: cambio.rebate });
                nuevoRegistro.setValue({ fieldId: FIELD.CRECIMIENTO, value: cambio.crecimiento });

                log.debug({
                    title: 'MR map - valores antes de save()',
                    details: `proveedor: ${nuevoRegistro.getValue({ fieldId: FIELD.PROVEEDOR })} | marca: ${nuevoRegistro.getValue({ fieldId: FIELD.MARCA })} | articulo: ${nuevoRegistro.getValue({ fieldId: FIELD.ARTICULO })}`
                });

                const newId = nuevoRegistro.save();

                log.audit({ title: 'MR map - registro CREADO con éxito', details: `newId: ${newId} | item: ${cambio.item}` });

                context.write({ key: String(newId), value: 'created' });
            }
        } catch (e) {
            log.error({
                title: `MR map - ERROR procesando cambio - Artículo ${cambio.item}`,
                details: `${e.name}: ${e.message}`
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
            log.error({ title: `MR summarize - Error en fase Map - registro ${key}`, details: error });
            return true;
        });

        if (summary.inputSummary.error) {
            log.error({ title: 'MR summarize - Error en fase getInputData', details: summary.inputSummary.error });
        }

        log.audit({
            title: 'MR summarize - Resumen Map/Reduce Condiciones Comerciales',
            details: `Creados: ${creados} | Actualizados: ${actualizados} | Errores: ${errores} | Usage consumido (map): ${summary.mapSummary.usage} | Tiempo total: ${summary.seconds}s`
        });
    };

    return { getInputData, map, summarize };
});