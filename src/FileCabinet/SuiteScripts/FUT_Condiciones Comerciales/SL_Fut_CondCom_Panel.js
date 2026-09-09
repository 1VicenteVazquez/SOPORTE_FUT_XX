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
    const FIELD_REQ_METAS = 'custrecord_condcom_req_metas';
    const FIELD_REQ_PRECIOS = 'custrecord_condcom_req_precios';

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

        const idsOriginalesField = form.addField({ id: 'custpage_ids_originales', type: serverWidget.FieldType.TEXT, label: 'IDs Originales' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

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

        // --- CHECKBOXES GLOBALES EN EL ENCABEZADO (OCULTOS EN VIEW, VISIBLES EN EDIT) ---
        const displayHeaderType = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.HIDDEN;
        
        const chkGlobalMetas = form.addField({ id: 'custpage_global_metas', type: serverWidget.FieldType.CHECKBOX, label: 'Habilitar Matriz de Metas' });
        chkGlobalMetas.updateDisplayType({ displayType: displayHeaderType });

        const chkGlobalPrecios = form.addField({ id: 'custpage_global_precios', type: serverWidget.FieldType.CHECKBOX, label: 'Habilitar Precios Especiales' });
        chkGlobalPrecios.updateDisplayType({ displayType: displayHeaderType });

        form.addButton({ id: 'custpage_btn_buscar', label: 'Buscar', functionName: 'buscarCondiciones' });
        
        if (proveedorId && marcaId) {
            if (isEdit) {
                form.addSubmitButton({ label: 'Guardar Cambios' }); 
                form.addButton({ id: 'custpage_btn_cancelar', label: 'Cancelar', functionName: 'cancelarEdicion' });
            } else {
                form.addSubmitButton({ label: 'Editar' }); 
            }
        }

        const tipoSublista = isEdit ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST;
        const displayModo = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        
        const sublist = form.addSublist({ id: 'custpage_sublist', type: tipoSublista, label: 'Reglas de Condiciones Comerciales' });
        
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        const fldProvSub = sublist.addField({ id: 'custpage_col_prov_txt', type: serverWidget.FieldType.TEXT, label: 'Proveedor' });
        fldProvSub.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        
        const fldMarcaSub = sublist.addField({ id: 'custpage_col_marca_txt', type: serverWidget.FieldType.TEXT, label: 'Marca' });
        fldMarcaSub.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldCreado = sublist.addField({ id: 'custpage_col_creado', type: serverWidget.FieldType.TEXT, label: 'Fecha de Creación' });
        fldCreado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldModificado = sublist.addField({ id: 'custpage_col_modificado', type: serverWidget.FieldType.TEXT, label: 'Última Modificación' });
        fldModificado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldCreador = sublist.addField({ id: 'custpage_col_creador', type: serverWidget.FieldType.TEXT, label: 'Creado Por' });
        fldCreador.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayModo });
        
        const fldCondicion = sublist.addField({ id: 'custpage_col_condicion', type: serverWidget.FieldType.TEXT, label: 'Nombre de la Condición' });
        fldCondicion.updateDisplayType({ displayType: displayModo });
        if (isEdit) fldCondicion.isMandatory = true; 
        
        const fldPP = sublist.addField({ 
            id: 'custpage_col_pp', 
            type: serverWidget.FieldType.SELECT, 
            label: 'Pronto Pago (%)'
        }).updateDisplayType({ displayType: displayModo });

        fldPP.addSelectOption({ value: '', text: '' });

        search.create({
            type: 'customlist_fut_lista_porcentajes_descu',
            columns: ['name']
        }).run().each((res) => {
            fldPP.addSelectOption({ value: res.id, text: res.getValue('name') });
            return true;
        });

        if (proveedorId && marcaId) {
            const idsOriginales = [];
            let globalMetasActivo = false;
            let globalPreciosActivo = false;
            let datosLineas = [];
            
            search.create({
                type: CUSTOM_RECORD_PADRE,
                filters: [[FIELD_PROVEEDOR, 'anyof', proveedorId], 'AND', [FIELD_MARCA, 'anyof', marcaId]],
                columns: ['internalid', FIELD_ACTIVO, FIELD_NOMBRE, FIELD_PRONTO_PAGO, FIELD_PROVEEDOR, FIELD_MARCA, 'created', 'lastmodified', 'owner', FIELD_REQ_METAS, FIELD_REQ_PRECIOS]
            }).run().each(res => {
                const idRegistro = res.id;
                idsOriginales.push(idRegistro);
                
                const reqMetas = res.getValue(FIELD_REQ_METAS);
                const reqPrecios = res.getValue(FIELD_REQ_PRECIOS);
                
                if (reqMetas === 'T' || reqMetas === true) globalMetasActivo = true;
                if (reqPrecios === 'T' || reqPrecios === true) globalPreciosActivo = true;

                datosLineas.push({
                    idRegistro: idRegistro,
                    provTxt: res.getText(FIELD_PROVEEDOR) || res.getValue(FIELD_PROVEEDOR) || '---',
                    marcaTxt: res.getText(FIELD_MARCA) || res.getValue(FIELD_MARCA) || '---',
                    fechaCreacion: res.getValue('created') || '',
                    fechaModificacion: res.getValue('lastmodified') || '',
                    creadorNombre: res.getText('owner') || res.getValue('owner') || '---',
                    estaActivo: res.getValue(FIELD_ACTIVO),
                    nombre: res.getValue(FIELD_NOMBRE) || res.getText(FIELD_NOMBRE) || 'Sin Nombre',
                    prontoPago: res.getValue(FIELD_PRONTO_PAGO)
                });
                
                return true;
            });

            chkGlobalMetas.defaultValue = globalMetasActivo ? 'T' : 'F';
            chkGlobalPrecios.defaultValue = globalPreciosActivo ? 'T' : 'F';

            if (globalMetasActivo || isEdit) {
                sublist.addField({ id: 'custpage_col_metas', type: serverWidget.FieldType.TEXTAREA, label: 'Matriz de Metas' })
                       .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            }
            if (globalPreciosActivo || isEdit) {
                sublist.addField({ id: 'custpage_col_precios', type: serverWidget.FieldType.TEXTAREA, label: 'Precios Especiales' })
                       .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            }

            for (let i = 0; i < datosLineas.length; i++) {
                const data = datosLineas[i];

                sublist.setSublistValue({ id: 'custpage_col_creador', line: i, value: data.creadorNombre });
                sublist.setSublistValue({ id: 'custpage_col_id', line: i, value: data.idRegistro });
                sublist.setSublistValue({ id: 'custpage_col_prov_txt', line: i, value: data.provTxt });
                sublist.setSublistValue({ id: 'custpage_col_marca_txt', line: i, value: data.marcaTxt });
                
                if (data.fechaCreacion) sublist.setSublistValue({ id: 'custpage_col_creado', line: i, value: data.fechaCreacion });
                if (data.fechaModificacion) sublist.setSublistValue({ id: 'custpage_col_modificado', line: i, value: data.fechaModificacion });

                sublist.setSublistValue({ id: 'custpage_col_activo', line: i, value: (data.estaActivo === 'T' || data.estaActivo === true) ? 'T' : 'F' });
                sublist.setSublistValue({ id: 'custpage_col_condicion', line: i, value: data.nombre });
                
                if (data.prontoPago !== null && data.prontoPago !== '') {
                    sublist.setSublistValue({ id: 'custpage_col_pp', line: i, value: data.prontoPago });
                }

                if (!isEdit) {
                    if (globalMetasActivo) {
                        sublist.setSublistValue({ 
                            id: 'custpage_col_metas', line: i, 
                            value: `<a href="#" onclick="abrirMatrizMetas('${data.idRegistro}','${mode}')">Ver Metas</a>` 
                        });
                    }
                    if (globalPreciosActivo) {
                        sublist.setSublistValue({ 
                            id: 'custpage_col_precios', line: i, 
                            value: `<a href="#" onclick="abrirMatrizPrecios('${data.idRegistro}','${mode}')">Ver Precios</a>` 
                        });
                    }
                }
            }

            idsOriginalesField.defaultValue = idsOriginales.join(',');
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

        const globalCheckMetas = (req.parameters.custpage_global_metas === 'T');
        const globalCheckPrecios = (req.parameters.custpage_global_precios === 'T');

        const idsOriginales = (req.parameters.custpage_ids_originales || '')
            .split(',')
            .map(id => id.trim())
            .filter(id => id);

        const idsEnviados = [];
        const lineCount = req.getLineCount({ group: 'custpage_sublist' });
        
        for (let i = 0; i < lineCount; i++) {
            const idRegistro = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_id', line: i });
            const estaActivo = (req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_activo', line: i }) === 'T');
            const nombreCond = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_condicion', line: i });
            const prontoPago = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_pp', line: i });

            if (idRegistro) {
                idsEnviados.push(String(idRegistro).trim());
                try {
                    const rec = record.load({ type: CUSTOM_RECORD_PADRE, id: idRegistro });
                    const oldActivo = rec.getValue(FIELD_ACTIVO);
                    const oldNombre = rec.getValue(FIELD_NOMBRE);
                    const oldPP = rec.getValue(FIELD_PRONTO_PAGO);
                    const oldMetas = rec.getValue(FIELD_REQ_METAS);
                    const oldPrecios = rec.getValue(FIELD_REQ_PRECIOS);

                    const ruleDataChanged = (oldActivo !== estaActivo) || (oldNombre !== nombreCond) || (oldPP !== (prontoPago || ''));
                    const flagsChanged = (oldMetas !== globalCheckMetas) || (oldPrecios !== globalCheckPrecios);

                    if (ruleDataChanged) {
                        // Cambió la regla comercial: guardado completo para actualizar lastmodified
                        rec.setValue({ fieldId: FIELD_ACTIVO, value: estaActivo });
                        if (nombreCond) rec.setValue({ fieldId: FIELD_NOMBRE, value: nombreCond });
                        rec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? prontoPago : null });
                        rec.setValue({ fieldId: FIELD_REQ_METAS, value: globalCheckMetas });
                        rec.setValue({ fieldId: FIELD_REQ_PRECIOS, value: globalCheckPrecios });
                        rec.save({ ignoreMandatoryFields: true });
                    } else if (flagsChanged) {
                        // Solo cambiaron los checkboxes globales: usamos submitFields para NO alterar la fecha de Última Modificación
                        record.submitFields({
                            type: CUSTOM_RECORD_PADRE,
                            id: idRegistro,
                            values: {
                                [FIELD_REQ_METAS]: globalCheckMetas,
                                [FIELD_REQ_PRECIOS]: globalCheckPrecios
                            }
                        });
                    }
                } catch (e) { 
                    log.error(`Error actualizando Cabecera ID ${idRegistro}`, e.message); 
                }
            } else if (nombreCond) {
                try {
                    const nuevoRec = record.create({ type: CUSTOM_RECORD_PADRE });
                    nuevoRec.setValue({ fieldId: FIELD_PROVEEDOR, value: proveedorId });
                    nuevoRec.setValue({ fieldId: FIELD_MARCA, value: marcaId });
                    nuevoRec.setValue({ fieldId: FIELD_NOMBRE, value: nombreCond });
                    nuevoRec.setValue({ fieldId: FIELD_ACTIVO, value: estaActivo });
                    nuevoRec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? prontoPago : null });
                    nuevoRec.setValue({ fieldId: FIELD_REQ_METAS, value: globalCheckMetas });
                    nuevoRec.setValue({ fieldId: FIELD_REQ_PRECIOS, value: globalCheckPrecios });
                    nuevoRec.save({ ignoreMandatoryFields: true });
                } catch (e) {
                    log.error('Error creando nueva Cabecera', e.message);
                }
            }
        }

        const idsAEliminar = idsOriginales.filter(id => idsEnviados.indexOf(id) === -1);

        idsAEliminar.forEach(id => {
            try {
                record.delete({ type: CUSTOM_RECORD_PADRE, id: id });
            } catch (e) {
                log.error(`Error eliminando condición ID ${id}`, e.message);
            }
        });

        redirect.toSuitelet({
            scriptId: 'customscript_fut_sl_condcom_panel',
            deploymentId: 'customdeploy_fut_sl_condcom_panel',
            parameters: { proveedor: proveedorId, marca: marcaId, mode: 'view' }
        });
    }

    return { onRequest };
});