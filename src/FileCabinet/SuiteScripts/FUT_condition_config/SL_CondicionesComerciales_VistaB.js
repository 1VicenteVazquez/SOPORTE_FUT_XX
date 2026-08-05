/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaB.js
 *
 * Ventana flotante (popup): cuadrícula editable (INLINEEDITOR) con los
 * Artículos y sus porcentajes (Pronto Pago / Rebate / Crecimiento) para
 * un Proveedor + Marca. Permite agregar artículos nuevos a la lista.
 * Al presionar "Guardar y Cerrar", el Client Script empaqueta solo las
 * líneas que cambiaron en un JSON y hace POST a este mismo Suitelet,
 * que lanza el Map/Reduce para aplicar los cambios de forma asíncrona.
 *
 * Rango válido de los % (Pronto Pago / Rebate / Crecimiento): 0 a 20,
 * con decimales. La validación en sí vive en el Client Script
 * (CS_CondicionesComerciales_VistaB.js / validateField).
 */
define(['N/ui/serverWidget', 'N/search', 'N/task', 'N/log'], (serverWidget, search, task, log) => {

    const CUSTOM_RECORD_ID = 'customrecord_fut_condiciones_comerciales';
    const MARCA_LIST_ID = 'customlist_nso_list_marca';

    const MR_VISTA_B = {
        scriptId: 'customscript_fut_mr_condcom_actualizar',
        deploymentId: 'customdeploy_fut_mr_condcom_actualizar'
    };

    const FIELD = {
        PROVEEDOR: 'custrecord_cc_proveedor',
        MARCA: 'custrecord_cc_marca',
        ARTICULO: 'custrecord_cc_articulo',
        ACTIVO: 'custrecord_cc_activo',
        PRONTO_PAGO: 'custrecord_cc_pronto_pago',
        REBATE: 'custrecord_cc_rebate',
        CRECIMIENTO: 'custrecord_cc_crecimiento'
    };

    const onRequest = (context) => {
        log.debug({ title: 'SL_VistaB onRequest', details: `Método: ${context.request.method} | Params: ${JSON.stringify(context.request.parameters)}` });

        if (context.request.method === 'GET') {
            renderPopup(context);
        } else {
            handleSave(context);
        }
    };

    function renderPopup(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor;
        const marcaId = params.marca;

        log.debug({ title: 'SL_VistaB renderPopup', details: `proveedorId: ${proveedorId} | marcaId: ${marcaId}` });

        const form = serverWidget.createForm({ title: 'Editar Condiciones Comerciales' });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaB.js';

        const proveedorField = form.addField({
            id: 'custpage_proveedor',
            type: serverWidget.FieldType.SELECT,
            label: 'Proveedor',
            source: 'vendor'
        });
        proveedorField.defaultValue = proveedorId;
        proveedorField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        const marcaField = form.addField({
            id: 'custpage_marca',
            type: serverWidget.FieldType.SELECT,
            label: 'Marca',
            source: MARCA_LIST_ID
        });
        marcaField.defaultValue = marcaId;
        marcaField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // Campo oculto donde el Client Script deposita el JSON de cambios
        const payloadField = form.addField({
            id: 'custpage_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Payload'
        });
        payloadField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Selector para agregar un artículo nuevo a la cuadrícula
        form.addField({
            id: 'custpage_nuevo_item',
            type: serverWidget.FieldType.SELECT,
            label: 'Agregar Artículo',
            source: 'item'
        });

        form.addButton({
            id: 'custpage_btn_agregar_linea',
            label: 'Agregar a la lista',
            functionName: 'agregarLinea'
        });

        form.addSubmitButton({ label: 'Guardar y Cerrar' });

        const sublist = form.addSublist({
            id: 'custpage_sublist',
            type: serverWidget.SublistType.INLINEEDITOR,
            label: 'Artículos'
        });

        const idCol = sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        idCol.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        const itemCol = sublist.addField({ id: 'custpage_col_item', type: serverWidget.FieldType.SELECT, label: 'Artículo', source: 'item' });
        itemCol.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' });
        // Rango permitido 0-20 con decimales -> se valida en el Client Script
        sublist.addField({ id: 'custpage_col_prontopago', type: serverWidget.FieldType.FLOAT, label: 'Pronto Pago % (0-20)' });
        sublist.addField({ id: 'custpage_col_rebate', type: serverWidget.FieldType.FLOAT, label: 'Rebate % (0-20)' });
        sublist.addField({ id: 'custpage_col_crecimiento', type: serverWidget.FieldType.FLOAT, label: 'Crec. Extraordinario % (0-20)' });

        const registros = buscarCondicionesComerciales(proveedorId, marcaId);

        log.debug({ title: 'SL_VistaB registros encontrados', details: registros.length });

        registros.forEach((r, i) => {
            sublist.setSublistValue({ id: 'custpage_col_id', line: i, value: r.id });
            sublist.setSublistValue({ id: 'custpage_col_item', line: i, value: r.itemId });
            sublist.setSublistValue({ id: 'custpage_col_activo', line: i, value: r.activo ? 'T' : 'F' });
            sublist.setSublistValue({ id: 'custpage_col_prontopago', line: i, value: r.prontoPago });
            sublist.setSublistValue({ id: 'custpage_col_rebate', line: i, value: r.rebate });
            sublist.setSublistValue({ id: 'custpage_col_crecimiento', line: i, value: r.crecimiento });
        });

        context.response.writePage(form);
    }

    function buscarCondicionesComerciales(proveedorId, marcaId) {
        const out = [];

        try {
            const s = search.create({
                type: CUSTOM_RECORD_ID,
                filters: [
                    [FIELD.PROVEEDOR, 'anyof', proveedorId],
                    'AND',
                    [FIELD.MARCA, 'anyof', marcaId]
                ],
                columns: [FIELD.ARTICULO, FIELD.ACTIVO, FIELD.PRONTO_PAGO, FIELD.REBATE, FIELD.CRECIMIENTO]
            });

            s.run().each((r) => {
                out.push({
                    id: r.id,
                    itemId: r.getValue(FIELD.ARTICULO),
                    activo: r.getValue(FIELD.ACTIVO) === true || r.getValue(FIELD.ACTIVO) === 'T',
                    prontoPago: r.getValue(FIELD.PRONTO_PAGO),
                    rebate: r.getValue(FIELD.REBATE),
                    crecimiento: r.getValue(FIELD.CRECIMIENTO)
                });
                return true;
            });
        } catch (e) {
            log.error({ title: 'SL_VistaB - Error en buscarCondicionesComerciales', details: e.message });
        }

        return out;
    }

    function handleSave(context) {
        const params = context.request.parameters;
        const proveedorId = params.custpage_proveedor;
        const marcaId = params.custpage_marca;
        const payloadRaw = params.custpage_payload;

        log.debug({ title: 'SL_VistaB handleSave', details: `proveedorId: ${proveedorId} | marcaId: ${marcaId} | payload length: ${payloadRaw ? payloadRaw.length : 0}` });

        let cambios = [];
        try {
            cambios = payloadRaw ? JSON.parse(payloadRaw) : [];
        } catch (e) {
            log.error({ title: 'SL_VistaB - Error parseando payload', details: e.message });
        }

        log.debug({ title: 'SL_VistaB handleSave - cambios a procesar', details: cambios.length });

        if (cambios.length > 0) {
            try {
                const mrTask = task.create({ taskType: task.TaskType.MAP_REDUCE });
                mrTask.scriptId = MR_VISTA_B.scriptId;
                mrTask.deploymentId = MR_VISTA_B.deploymentId;
                mrTask.params = {
                    custscript_mr_cc_proveedor: proveedorId,
                    custscript_mr_cc_marca: marcaId,
                    custscript_mr_cc_cambios: JSON.stringify(cambios)
                };
                const taskId = mrTask.submit();
                log.debug({ title: 'SL_VistaB - Map/Reduce lanzado', details: `taskId: ${taskId}` });
            } catch (e) {
                log.error({ title: 'SL_VistaB - Error lanzando Map/Reduce', details: e.message });
            }
        }

        // Página mínima que cierra la ventana flotante y refresca la Vista A
        context.response.write(
            '<html><body>' +
            '<script>' +
            'if (window.opener && !window.opener.closed) { window.opener.location.reload(); }' +
            'window.close();' +
            '</script>' +
            'Guardado. Puede cerrar esta ventana si no se cierra sola.' +
            '</body></html>'
        ); 
    }

    return { onRequest };
});