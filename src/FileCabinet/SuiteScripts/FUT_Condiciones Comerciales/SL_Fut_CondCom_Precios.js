/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_Fut_CondCom_Precios.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log'], (serverWidget, search, record, redirect, log) => {

    const RECORD_PRECIOS = 'customrecord_fut_precio_esp_art';
    const FLD_PADRE = 'custrecord_pea_padre'; 
    const FLD_ARTICULO = 'custrecord_pea_articulo'; 
    const FLD_PRECIO = 'custrecord_pea_precio';
    const FLD_ACTIVO = 'custrecord_pea_activo';
    const FLD_DESCRIPCION = 'custrecord_pea_descripcion';

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') procesarGuardado(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const registroId = params.registroId;
        const mode = params.mode || 'view';
        const isEdit = (mode === 'edit');

        let nombrePadre = 'Condición Comercial';
        let marcaPadre = ''; 
        
        if (registroId) {
            try {
                const parentLookup = search.lookupFields({
                    type: 'customrecord_fut_condcom',
                    id: registroId,
                    columns: ['custrecord_condcom_nombre', 'custrecord_condcom_marca']
                });
                if (parentLookup && parentLookup.custrecord_condcom_nombre) nombrePadre = parentLookup.custrecord_condcom_nombre;
                
                if (parentLookup && parentLookup.custrecord_condcom_marca) {
                    let m = parentLookup.custrecord_condcom_marca;
                    marcaPadre = Array.isArray(m) ? m[0].value : m;
                }
            } catch(e) {}
        }

        const form = serverWidget.createForm({ title: 'Precios Especiales: ' + nombrePadre, hideNavBar: true });
        
        form.clientScriptModulePath = './CS_Fut_CondCom_Precios.js'; 

        form.addField({ id: 'custpage_mode', type: serverWidget.FieldType.TEXT, label: 'Mode' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = mode;
        form.addField({ id: 'custpage_registro_id', type: serverWidget.FieldType.TEXT, label: 'ID Padre' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = registroId;

        const tipoSublista = isEdit ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST;
        const displayModo = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        
        const sublist = form.addSublist({ id: 'custpage_sublist_precios', type: tipoSublista, label: 'Artículos con Precio Especial' });
        
        // --- COLUMNA OCULTA PARA EL ID DEL REGISTRO ---
        const fldPrecioId = sublist.addField({ id: 'custpage_col_precio_id', type: serverWidget.FieldType.TEXT, label: 'Internal ID' });
        fldPrecioId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayModo });
        
        const fldArticulo = sublist.addField({ id: 'custpage_col_articulo', type: serverWidget.FieldType.SELECT, label: 'Artículo' });
        fldArticulo.updateDisplayType({ displayType: displayModo });
        
        const fldDesc = sublist.addField({ id: 'custpage_col_descripcion', type: serverWidget.FieldType.TEXTAREA, label: 'Descripción' });
        fldDesc.updateDisplayType({ displayType: displayModo });

        const fldCreado = sublist.addField({ id: 'custpage_col_creado', type: serverWidget.FieldType.TEXT, label: 'Fecha de Creación' });
        fldCreado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldModificado = sublist.addField({ id: 'custpage_col_modificado', type: serverWidget.FieldType.TEXT, label: 'Última Modificación' });
        fldModificado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldPrecio = sublist.addField({ id: 'custpage_col_precio', type: serverWidget.FieldType.CURRENCY, label: 'Precio Especial' });
        fldPrecio.updateDisplayType({ displayType: displayModo });


        if (isEdit) {
            fldArticulo.isMandatory = true;
            fldPrecio.isMandatory = true;
        }

        fldArticulo.addSelectOption({ value: '', text: '' });
        
        if (marcaPadre) {
            search.create({
                type: search.Type.ITEM,
                filters: [
                    ['custitem_nso_marca', 'anyof', marcaPadre],
                    'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: ['itemid', 'displayname']
            }).run().each(res => {
                let nombreItem = res.getValue('itemid');
                let descripcion = res.getValue('displayname');
                if (descripcion && descripcion !== nombreItem) nombreItem += ' - ' + descripcion; 
                fldArticulo.addSelectOption({ value: res.id, text: nombreItem });
                return true;
            });
        }

        if (registroId) {
            let line = 0;
            search.create({
                type: RECORD_PRECIOS,
                filters: [[FLD_PADRE, 'anyof', registroId]],
                columns: ['internalid', FLD_ACTIVO, FLD_ARTICULO, FLD_PRECIO, FLD_DESCRIPCION, 'created', 'lastmodified']
            }).run().each(res => {
                // Guardamos el ID en la columna oculta
                sublist.setSublistValue({ id: 'custpage_col_precio_id', line: line, value: res.id });

                let estaActivo = res.getValue(FLD_ACTIVO);
                sublist.setSublistValue({ id: 'custpage_col_activo', line: line, value: (estaActivo === true || estaActivo === 'T') ? 'T' : 'F' });
                
                let art = res.getValue(FLD_ARTICULO);
                if (art) {
                    try { sublist.setSublistValue({ id: 'custpage_col_articulo', line: line, value: art }); } catch(e){}
                }
                
                let desc = res.getValue(FLD_DESCRIPCION);
                if (desc) sublist.setSublistValue({ id: 'custpage_col_descripcion', line: line, value: desc });

                let creado = res.getValue('created');
                if (creado) sublist.setSublistValue({ id: 'custpage_col_creado', line: line, value: creado });
                
                let modificado = res.getValue('lastmodified');
                if (modificado) sublist.setSublistValue({ id: 'custpage_col_modificado', line: line, value: modificado });

                let precio = res.getValue(FLD_PRECIO);
                if (precio) sublist.setSublistValue({ id: 'custpage_col_precio', line: line, value: precio });
                
                line++;
                return true;
            });
        }

        if (isEdit) {
            form.addSubmitButton({ label: 'Guardar Precios' });
            form.addButton({ id: 'btn_cancelar', label: 'Cancelar', functionName: 'cancelarEdicionPrecios' });
        } else {
            form.addSubmitButton({ label: 'Editar' });
            form.addButton({ id: 'btn_cerrar', label: 'Cerrar Ventana', functionName: 'cerrarPopup' });
        }

        context.response.writePage(form);
    }

    function procesarGuardado(context) {
        const req = context.request;
        const registroId = req.parameters.custpage_registro_id;
        const mode = req.parameters.custpage_mode;

        if (mode === 'view') {
            redirect.toSuitelet({
                scriptId: 'customscript_fut_sl_condcom_precios',
                deploymentId: 'customdeploy_fut_sl_condcom_precios',
                parameters: { registroId: registroId, mode: 'edit', hideNavBar: 'T' }
            });
            return;
        }

        if (registroId) {
            try {
                const lineCount = req.getLineCount({ group: 'custpage_sublist_precios' });
                let submittedIds = [];

                // PASO 1: Recolectar todos los IDs y forzarlos a String
                for (let i = 0; i < lineCount; i++) {
                    let precioId = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_precio_id', line: i });
                    if (precioId) submittedIds.push(String(precioId).trim());
                }

                // PASO 2: Borrar únicamente los registros que ya no están en la pantalla
                search.create({
                    type: RECORD_PRECIOS,
                    filters: [[FLD_PADRE, 'anyof', registroId]]
                }).run().each(res => {
                    if (!submittedIds.includes(String(res.id).trim())) {
                        record.delete({ type: RECORD_PRECIOS, id: res.id });
                    }
                    return true;
                });

                // PASO 3: Actualizar existentes (solo si cambian) y Crear nuevos
                for (let i = 0; i < lineCount; i++) {
                    const precioId = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_precio_id', line: i });
                    const activoVal = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_activo', line: i });
                    const isActivo = (activoVal === 'T' || activoVal === 'true' || activoVal === true);
                    const articulo = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_articulo', line: i });
                    const descripcion = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_descripcion', line: i }) || '';
                    const precio = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_precio', line: i });

                    if (articulo && precio) {
                        
                        if (precioId) {
                            // MODO ACTUALIZACIÓN INTELIGENTE (Dirty Checking)
                            let recToUpdate = record.load({ type: RECORD_PRECIOS, id: precioId });
                            let isModified = false;

                            // Comparamos los 4 campos uno a uno
                            if (recToUpdate.getValue(FLD_ACTIVO) !== isActivo) {
                                recToUpdate.setValue({ fieldId: FLD_ACTIVO, value: isActivo });
                                isModified = true;
                            }
                            
                            if (String(recToUpdate.getValue(FLD_ARTICULO)) !== String(articulo)) {
                                recToUpdate.setValue({ fieldId: FLD_ARTICULO, value: articulo });
                                isModified = true;
                            }
                            
                            let currentDesc = recToUpdate.getValue(FLD_DESCRIPCION) || '';
                            if (currentDesc !== descripcion) {
                                recToUpdate.setValue({ fieldId: FLD_DESCRIPCION, value: descripcion });
                                isModified = true;
                            }
                            
                            let currentPrecio = recToUpdate.getValue(FLD_PRECIO) || 0;
                            if (parseFloat(currentPrecio) !== parseFloat(precio)) {
                                recToUpdate.setValue({ fieldId: FLD_PRECIO, value: parseFloat(precio) });
                                isModified = true;
                            }

                            // SOLO SE GUARDA SI HUBO ALGÚN CAMBIO
                            if (isModified) {
                                recToUpdate.save({ ignoreMandatoryFields: true });
                            }

                        } else {
                            // MODO CREACIÓN (Nuevo registro en blanco)
                            let nuevoRegistro = record.create({ type: RECORD_PRECIOS });
                            
                            nuevoRegistro.setValue({ fieldId: FLD_PADRE, value: registroId });
                            nuevoRegistro.setValue({ fieldId: FLD_ACTIVO, value: isActivo });
                            nuevoRegistro.setValue({ fieldId: FLD_ARTICULO, value: articulo });
                            if (descripcion) nuevoRegistro.setValue({ fieldId: FLD_DESCRIPCION, value: descripcion });
                            nuevoRegistro.setValue({ fieldId: FLD_PRECIO, value: parseFloat(precio) });
                            
                            nuevoRegistro.save({ ignoreMandatoryFields: true });
                        }
                    }
                }
            } catch (e) {
                log.error('Error procesando Precios', e.message);
            }
        }

        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:40px;">
                <h3 style="color:#28a745;">¡Precios Especiales actualizados con éxito!</h3>
                <script>
                    setTimeout(function(){ if(window.opener) window.opener.location.reload(); window.close(); }, 1500);
                </script>
            </body></html>
        `);
    }

    return { onRequest };
});