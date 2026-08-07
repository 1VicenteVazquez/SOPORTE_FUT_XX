/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaA.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log'], (serverWidget, search, record, redirect, log) => {

    const CUSTOM_RECORD_PADRE = 'customrecord_fut_condiciones_comerciales';

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') guardarCambios(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor || '';
        let marcaId = params.marca || '';

        const form = serverWidget.createForm({ title: 'Condiciones Comerciales por Proveedor' });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaA.js';

        const proveedorField = form.addField({ id: 'custpage_proveedor', type: serverWidget.FieldType.SELECT, label: 'Proveedor', source: 'vendor' });
        proveedorField.isMandatory = true;
        if (proveedorId) proveedorField.defaultValue = proveedorId;

        const marcaField = form.addField({ id: 'custpage_marca', type: serverWidget.FieldType.SELECT, label: 'Marca' });
        marcaField.isMandatory = true;
        marcaField.addSelectOption({ value: '', text: '' });

        if (proveedorId) {
            search.create({ type: search.Type.VENDOR, filters: [['internalid', 'anyof', proveedorId]], columns: ['custentity_marca'] }).run().each(res => {
                const arrVals = (res.getValue('custentity_marca') || '').split(',');
                const arrTexts = (res.getText('custentity_marca') || '').split(',');
                for(let i=0; i<arrVals.length; i++) {
                    if (arrVals[i]) marcaField.addSelectOption({ value: arrVals[i].trim(), text: arrTexts[i] ? arrTexts[i].trim() : arrVals[i] });
                }
                if (arrVals.length === 1 && !marcaId) marcaId = arrVals[0].trim();
                return false;
            });
        }
        if (marcaId) marcaField.defaultValue = marcaId;

        form.addButton({ id: 'custpage_btn_buscar', label: 'Buscar / Refrescar', functionName: 'buscarCondiciones' });
        if (proveedorId && marcaId) form.addSubmitButton({ label: 'Guardar Checkboxes' });

        const sublist = form.addSublist({ id: 'custpage_sublist', type: serverWidget.SublistType.LIST, label: 'Reglas de Condiciones Comerciales' });

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.ENTRY });
        sublist.addField({ id: 'custpage_col_condicion', type: serverWidget.FieldType.TEXT, label: 'Condición Comercial' });
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublist.addField({ id: 'custpage_col_tipo_id', type: serverWidget.FieldType.TEXT, label: 'Tipo ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublist.addField({ id: 'custpage_col_accion', type: serverWidget.FieldType.TEXT, label: 'Acción' });

        if (proveedorId && marcaId) {
            obtenerCondicionesPadre(proveedorId, marcaId).forEach((cond, i) => {
                sublist.setSublistValue({ id: 'custpage_col_activo', line: i, value: cond.activo ? 'T' : 'F' });
                sublist.setSublistValue({ id: 'custpage_col_condicion', line: i, value: cond.nombre });
                sublist.setSublistValue({ id: 'custpage_col_id', line: i, value: cond.id });
                sublist.setSublistValue({ id: 'custpage_col_tipo_id', line: i, value: cond.tipoId });
                sublist.setSublistValue({ id: 'custpage_col_accion', line: i, value: `<a href="javascript:void(0);" onclick="abrirEdicionTipo('${cond.id}', '${cond.tipoId}')" style="display:inline-block;background:#005587;color:#fff;padding:5px 15px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:12px;">VER ARTÍCULOS</a>` });
            });
        }
        context.response.writePage(form);
    }

    function guardarCambios(context) {
        const req = context.request;
        const lineCount = req.getLineCount({ group: 'custpage_sublist' });

        for (let i = 0; i < lineCount; i++) {
            const idRegistro = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_id', line: i });
            const estaActivo = (req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_activo', line: i }) === 'T');

            if (idRegistro) {
                try {
                    // SOLUCIÓN: Carga y guardado directo
                    const rec = record.load({ type: CUSTOM_RECORD_PADRE, id: idRegistro });
                    rec.setValue({ fieldId: 'custrecord_cc_activo', value: estaActivo });
                    rec.save({ ignoreMandatoryFields: true });
                } catch (e) {
                    log.error(`Error guardando Padre ${idRegistro}`, e.message);
                }
            }
        }
        redirect.toSuitelet({
            scriptId: 'customscript_fut_sl_condcom_vista_a',
            deploymentId: 'customdeploy_fut_sl_condcom_vista_a',
            parameters: { proveedor: req.parameters.custpage_proveedor, marca: req.parameters.custpage_marca }
        });
    }

    function obtenerCondicionesPadre(proveedorId, marcaId) {
        const lista = [];
        search.create({
            type: CUSTOM_RECORD_PADRE,
            filters: [['custrecord_cc_proveedor', 'anyof', proveedorId], 'AND', ['custrecord_fut_cc_marca', 'anyof', marcaId]],
            columns: ['internalid', 'custrecord_cc_activo', 'custrecord_fut_cc_nombre_condicion']
        }).run().each(res => {
            lista.push({
                id: res.id,
                activo: (res.getValue('custrecord_cc_activo') === 'T' || res.getValue('custrecord_cc_activo') === true),
                nombre: res.getText('custrecord_fut_cc_nombre_condicion') || 'Sin Nombre',
                tipoId: res.getValue('custrecord_fut_cc_nombre_condicion')
            });
            return true;
        });
        return lista;
    }

    return { onRequest };
});