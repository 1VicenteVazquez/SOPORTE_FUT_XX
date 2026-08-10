/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaA.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log'], (serverWidget, search, record, redirect, log) => {

    const CUSTOM_RECORD_PADRE = 'customrecord_fut_condiciones_comerciales';
    const CUSTOM_RECORD_PRONTO_PAGO = 'customrecord_fut_pronto_pago';
    
    // AQUÍ VA EL ID DE TU NUEVO CAMPO CHECKBOX DE PRONTO PAGO
    const CAMPO_ACTIVO_PP = 'custrecord_fut_pp_activo'; 

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') procesarBotonAzul(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor || '';
        let marcaId = params.marca || '';
        
        const mode = params.mode || 'view';
        const isEdit = (mode === 'edit');

        const form = serverWidget.createForm({ title: 'Condiciones Comerciales por Proveedor' });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaA.js';

        form.addField({ id: 'custpage_mode', type: serverWidget.FieldType.TEXT, label: 'Mode' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = mode;

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
        
        if (proveedorId && marcaId) {
            if (isEdit) {
                form.addSubmitButton({ label: 'Guardar' }); 
                form.addButton({ id: 'custpage_btn_cancelar', label: 'Cancelar', functionName: 'cancelarEdicion' });
            } else {
                form.addSubmitButton({ label: 'Editar' }); 
            }
        }

        const sublist = form.addSublist({ id: 'custpage_sublist', type: serverWidget.SublistType.LIST, label: 'Reglas de Condiciones Comerciales' });

        const displayCheckbox = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayCheckbox });
        
        sublist.addField({ id: 'custpage_col_condicion', type: serverWidget.FieldType.TEXT, label: 'Condición Comercial' });
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublist.addField({ id: 'custpage_col_tipo_id', type: serverWidget.FieldType.TEXT, label: 'Tipo ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublist.addField({ id: 'custpage_col_tabla', type: serverWidget.FieldType.TEXT, label: 'Tabla' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublist.addField({ id: 'custpage_col_accion', type: serverWidget.FieldType.TEXT, label: 'Acción' });

        if (proveedorId && marcaId) {
            obtenerCondicionesCombinadas(proveedorId, marcaId).forEach((cond, i) => {
                sublist.setSublistValue({ id: 'custpage_col_activo', line: i, value: cond.activo ? 'T' : 'F' });
                sublist.setSublistValue({ id: 'custpage_col_condicion', line: i, value: cond.nombre });
                sublist.setSublistValue({ id: 'custpage_col_id', line: i, value: cond.id });
                sublist.setSublistValue({ id: 'custpage_col_tipo_id', line: i, value: cond.tipoId });
                sublist.setSublistValue({ id: 'custpage_col_tabla', line: i, value: cond.tabla });
                
                const colorRebate = isEdit ? '#607799' : '#6c757d';
                const colorPP = isEdit ? '#607799' : '#6c757d';
                const txtRebate = isEdit ? 'EDITAR ARTÍCULOS' : 'VER ARTÍCULOS';
                const txtPP = isEdit ? 'ASIGNAR %' : 'VER %';

                if (cond.tabla === 'CC') {
                    sublist.setSublistValue({ id: 'custpage_col_accion', line: i, value: `<a href="javascript:void(0);" onclick="abrirEdicionTipo('${cond.id}', '${cond.tipoId}', '${mode}')" style="display:inline-block;background:${colorRebate};color:#fff;padding:5px 15px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:12px;">${txtRebate}</a>` });
                } else if (cond.tabla === 'PP') {
                    sublist.setSublistValue({ id: 'custpage_col_accion', line: i, value: `<a href="javascript:void(0);" onclick="abrirEdicionProntoPago('${cond.id}', '${mode}')" style="display:inline-block;background:${colorPP};color:#fff;padding:5px 15px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:12px;">${txtPP}</a>` });
                }
            });
        }
        context.response.writePage(form);
    }

    function procesarBotonAzul(context) {
        const req = context.request;
        const proveedorId = req.parameters.custpage_proveedor;
        const marcaId = req.parameters.custpage_marca;
        const modo = req.parameters.custpage_mode;

        if (modo === 'view') {
            redirect.toSuitelet({
                scriptId: 'customscript_fut_sl_condcom_vista_a',
                deploymentId: 'customdeploy_fut_sl_condcom_vista_a',
                parameters: { proveedor: proveedorId, marca: marcaId, mode: 'edit' }
            });
            return; 
        }

        const lineCount = req.getLineCount({ group: 'custpage_sublist' });
        for (let i = 0; i < lineCount; i++) {
            const idRegistro = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_id', line: i });
            const estaActivo = (req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_activo', line: i }) === 'T');
            const tabla = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_tabla', line: i });

            if (idRegistro) {
                try {
                    if (tabla === 'CC') {
                        // Guardado de Rebates
                        const rec = record.load({ type: CUSTOM_RECORD_PADRE, id: idRegistro });
                        rec.setValue({ fieldId: 'custrecord_cc_activo', value: estaActivo });
                        rec.save({ ignoreMandatoryFields: true });
                    } 
                    else if (tabla === 'PP') {
                        // NUEVO: Guardado de Pronto Pago usando tu nuevo campo
                        const recPP = record.load({ type: CUSTOM_RECORD_PRONTO_PAGO, id: idRegistro });
                        recPP.setValue({ fieldId: CAMPO_ACTIVO_PP, value: estaActivo });
                        recPP.save({ ignoreMandatoryFields: true });
                    }
                } catch (e) { log.error(`Error guardando ${idRegistro} en tabla ${tabla}`, e.message); }
            }
        }

        redirect.toSuitelet({
            scriptId: 'customscript_fut_sl_condcom_vista_a',
            deploymentId: 'customdeploy_fut_sl_condcom_vista_a',
            parameters: { proveedor: proveedorId, marca: marcaId, mode: 'view' }
        });
    }

    function obtenerCondicionesCombinadas(proveedorId, marcaId) {
        const lista = [];

        search.create({
            type: CUSTOM_RECORD_PADRE,
            filters: [['custrecord_cc_proveedor', 'anyof', proveedorId], 'AND', ['custrecord_fut_cc_marca', 'anyof', marcaId]],
            columns: ['internalid', 'custrecord_cc_activo', 'custrecord_fut_cc_nombre_condicion']
        }).run().each(res => {
            lista.push({
                tabla: 'CC', id: res.id,
                activo: (res.getValue('custrecord_cc_activo') === 'T' || res.getValue('custrecord_cc_activo') === true),
                nombre: res.getText('custrecord_fut_cc_nombre_condicion') || 'Sin Nombre',
                tipoId: res.getValue('custrecord_fut_cc_nombre_condicion')
            });
            return true;
        });

        // NUEVO: Agregamos tu campo CAMPO_ACTIVO_PP a la búsqueda
        search.create({
            type: CUSTOM_RECORD_PRONTO_PAGO,
            filters: [['custrecord_fut_pp_proveedor', 'anyof', proveedorId], 'AND', ['custrecord_fut_pp_marca', 'anyof', marcaId]],
            columns: ['internalid', 'custrecord_fut_pp_porcentaje', CAMPO_ACTIVO_PP]
        }).run().each(res => {
            const ppVal = res.getValue('custrecord_fut_pp_porcentaje');
            const estaActivo = (res.getValue(CAMPO_ACTIVO_PP) === 'T' || res.getValue(CAMPO_ACTIVO_PP) === true);

            lista.push({
                tabla: 'PP', 
                id: res.id, 
                activo: estaActivo,
                nombre: `PRONTO PAGO ${ppVal ? '(' + ppVal + '%)' : ''}`, 
                tipoId: 'PP'
            });
            return true;
        });

        return lista;
    }

    return { onRequest };
});