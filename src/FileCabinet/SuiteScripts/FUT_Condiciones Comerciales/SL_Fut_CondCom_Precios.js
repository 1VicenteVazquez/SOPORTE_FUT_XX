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
        
        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayModo });
        
        // --- CAMBIO CLAVE: Quitamos el "source: 'item'" para poder llenarlo nosotros ---
        const fldArticulo = sublist.addField({ id: 'custpage_col_articulo', type: serverWidget.FieldType.SELECT, label: 'Artículo' });
        fldArticulo.updateDisplayType({ displayType: displayModo });
        
        const fldPrecio = sublist.addField({ id: 'custpage_col_precio', type: serverWidget.FieldType.CURRENCY, label: 'Precio Especial' });
        fldPrecio.updateDisplayType({ displayType: displayModo });

        if (isEdit) {
            fldArticulo.isMandatory = true;
            fldPrecio.isMandatory = true;
        }

        // --- MAGIA AQUÍ: Rellenamos la lista desplegable dinámicamente filtrando por la marca ---
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
                if (descripcion) nombreItem += ' - ' + descripcion; 
                
                fldArticulo.addSelectOption({ value: res.id, text: nombreItem });
                return true;
            });
        }
        // ------------------------------------------------------------------

        if (registroId) {
            let line = 0;
            search.create({
                type: RECORD_PRECIOS,
                filters: [[FLD_PADRE, 'anyof', registroId]],
                columns: [FLD_ACTIVO, FLD_ARTICULO, FLD_PRECIO]
            }).run().each(res => {
                let estaActivo = res.getValue(FLD_ACTIVO);
                sublist.setSublistValue({ id: 'custpage_col_activo', line: line, value: (estaActivo === true || estaActivo === 'T') ? 'T' : 'F' });
                
                let art = res.getValue(FLD_ARTICULO);
                // Try/Catch por si intentan cargar un artículo que se inactivó en NetSuite recientemente
                if (art) {
                    try { sublist.setSublistValue({ id: 'custpage_col_articulo', line: line, value: art }); } catch(e){}
                }
                
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
                search.create({ type: RECORD_PRECIOS, filters: [[FLD_PADRE, 'anyof', registroId]] }).run().each(res => {
                    record.delete({ type: RECORD_PRECIOS, id: res.id });
                    return true;
                });

                const lineCount = req.getLineCount({ group: 'custpage_sublist_precios' });
                
                for (let i = 0; i < lineCount; i++) {
                    const activoVal = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_activo', line: i });
                    const isActivo = (activoVal === 'T' || activoVal === 'true' || activoVal === true);
                    const articulo = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_articulo', line: i });
                    const precio = req.getSublistValue({ group: 'custpage_sublist_precios', name: 'custpage_col_precio', line: i });

                    if(articulo && precio) {
                        const nuevoRegistro = record.create({ type: RECORD_PRECIOS });
                        nuevoRegistro.setValue({ fieldId: FLD_PADRE, value: registroId });
                        nuevoRegistro.setValue({ fieldId: FLD_ACTIVO, value: isActivo });
                        nuevoRegistro.setValue({ fieldId: FLD_ARTICULO, value: articulo });
                        nuevoRegistro.setValue({ fieldId: FLD_PRECIO, value: parseFloat(precio) });
                        nuevoRegistro.save({ ignoreMandatoryFields: true });
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