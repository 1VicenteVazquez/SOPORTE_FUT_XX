/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_Fut_CondCom_Panel.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log'], (serverWidget, search, record, redirect, log) => {

    const CUSTOM_RECORD_PADRE = 'customrecord_fut_condcom';
    const FIELD_PROVEEDOR = 'custrecord_condcom_proveedor';
    const FIELD_MARCA = 'custrecord_condcom_marca';
    const FIELD_NOMBRE = 'custrecord_condcom_nombre';
    const FIELD_ACTIVO = 'custrecord_condcom_activo';
    const FIELD_PRONTO_PAGO = 'custrecord_condcom_pronto_pago';

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') procesarGuardado(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor || '';
        let marcaId = params.marca || '';
        
        const mode = params.mode || 'view';
        const isEdit = (mode === 'edit');

        const form = serverWidget.createForm({ title: 'Panel de Condiciones Comerciales' });
        form.clientScriptModulePath = './CS_Fut_CondCom_Panel.js';

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

        form.addButton({ id: 'custpage_btn_buscar', label: 'Buscar', functionName: 'buscarCondiciones' });
        
        if (proveedorId && marcaId) {
            if (isEdit) {
                form.addSubmitButton({ label: 'Guardar Cambios' }); 
                form.addButton({ id: 'custpage_btn_cancelar', label: 'Cancelar', functionName: 'cancelarEdicion' });
            } else {
                form.addSubmitButton({ label: 'Editar' }); 
            }
        }

        // --- CLAVE PARA CRUD: INLINEEDITOR permite crear registros nuevos desde la interfaz ---
        const tipoSublista = isEdit ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST;
        const sublist = form.addSublist({ id: 'custpage_sublist', type: tipoSublista, label: 'Reglas Comerciales' });
        
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' });
        
        sublist.addField({ id: 'custpage_col_condicion', type: serverWidget.FieldType.TEXT, label: 'Nombre de la Condición' }).isMandatory = true;
        
        sublist.addField({ id: 'custpage_col_pp', type: serverWidget.FieldType.PERCENT, label: 'Pronto Pago (%)' });
        
        const colAccion = sublist.addField({ id: 'custpage_col_accion', type: serverWidget.FieldType.TEXT, label: 'Matriz de Metas' });
        if (isEdit) colAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        if (proveedorId && marcaId) {
            let lineIndex = 0;
            
            search.create({
                type: CUSTOM_RECORD_PADRE,
                filters: [[FIELD_PROVEEDOR, 'anyof', proveedorId], 'AND', [FIELD_MARCA, 'anyof', marcaId]],
                columns: ['internalid', FIELD_ACTIVO, FIELD_NOMBRE, FIELD_PRONTO_PAGO]
            }).run().each(res => {
                
                const idRegistro = res.id;
                const estaActivo = res.getValue(FIELD_ACTIVO);
                const nombre = res.getValue(FIELD_NOMBRE) || res.getText(FIELD_NOMBRE) || 'Sin Nombre';
                const prontoPago = res.getValue(FIELD_PRONTO_PAGO);

                sublist.setSublistValue({ id: 'custpage_col_id', line: lineIndex, value: idRegistro });
                sublist.setSublistValue({ id: 'custpage_col_activo', line: lineIndex, value: (estaActivo === 'T' || estaActivo === true) ? 'T' : 'F' });
                sublist.setSublistValue({ id: 'custpage_col_condicion', line: lineIndex, value: nombre });
                
                if (prontoPago !== null && prontoPago !== '') {
                    sublist.setSublistValue({ id: 'custpage_col_pp', line: lineIndex, value: prontoPago });
                }
                
                const txtLink = isEdit ? 'Configurar Metas' : 'Ver Metas';
                sublist.setSublistValue({ 
                    id: 'custpage_col_accion', 
                    line: lineIndex, 
                    value: `<a href="javascript:void(0);" onclick="abrirMatrizMetas('${idRegistro}', '${mode}')" class="dottedlink" style="font-weight:bold;">${txtLink}</a>` 
                });
                
                lineIndex++;
                return true;
            });
        }
        context.response.writePage(form);
    }

    function procesarGuardado(context) {
        const req = context.request;
        const proveedorId = req.parameters.custpage_proveedor;
        const marcaId = req.parameters.custpage_marca;
        const modo = req.parameters.custpage_mode;

        if (modo === 'view') {
            redirect.toSuitelet({
                scriptId: 'customscript_fut_sl_condcom_panel', 
                deploymentId: 'customdeploy_fut_sl_condcom_panel',
                parameters: { proveedor: proveedorId, marca: marcaId, mode: 'edit' }
            });
            return; 
        }

        const lineCount = req.getLineCount({ group: 'custpage_sublist' });
        
        for (let i = 0; i < lineCount; i++) {
            const idRegistro = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_id', line: i });
            const estaActivo = (req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_activo', line: i }) === 'T');
            const nombreCond = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_condicion', line: i });
            const prontoPago = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_pp', line: i });

            // UPDATE: Si la fila tiene ID, actualiza el registro existente
            if (idRegistro) {
                try {
                    const rec = record.load({ type: CUSTOM_RECORD_PADRE, id: idRegistro });
                    rec.setValue({ fieldId: FIELD_ACTIVO, value: estaActivo });
                    if (nombreCond) rec.setValue({ fieldId: FIELD_NOMBRE, value: nombreCond });
                    rec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? parseFloat(prontoPago) : 0 });
                    rec.save({ ignoreMandatoryFields: true });
                } catch (e) { 
                    log.error(`Error actualizando Cabecera ID ${idRegistro}`, e.message); 
                }
            } 
            // CREATE: Si la fila no tiene ID y tiene nombre, crea un registro nuevo desde el panel
            else if (nombreCond) {
                try {
                    const nuevoRec = record.create({ type: CUSTOM_RECORD_PADRE });
                    nuevoRec.setValue({ fieldId: FIELD_PROVEEDOR, value: proveedorId });
                    nuevoRec.setValue({ fieldId: FIELD_MARCA, value: marcaId });
                    nuevoRec.setValue({ fieldId: FIELD_NOMBRE, value: nombreCond });
                    nuevoRec.setValue({ fieldId: FIELD_ACTIVO, value: estaActivo });
                    nuevoRec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? parseFloat(prontoPago) : 0 });
                    nuevoRec.save({ ignoreMandatoryFields: true });
                } catch (e) {
                    log.error('Error creando nueva Cabecera', e.message);
                }
            }
        }

        redirect.toSuitelet({
            scriptId: 'customscript_fut_sl_condcom_panel',
            deploymentId: 'customdeploy_fut_sl_condcom_panel',
            parameters: { proveedor: proveedorId, marca: marcaId, mode: 'view' }
        });
    }

    return { onRequest };
});