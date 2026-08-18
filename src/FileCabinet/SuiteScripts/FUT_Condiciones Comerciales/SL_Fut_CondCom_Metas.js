/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_Fut_CondCom_Metas.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log'], (serverWidget, search, record, redirect, log) => {

    const RECORD_META = 'customrecord_fut_meta';
    const FLD_PADRE = 'custrecord_fut_meta_padre'; 
    const FLD_NOMBRE_ESCALA = 'custrecord_meta_nombre'; 
    const FLD_RIN_MIN = 'custrecord_rin_min';
    const FLD_RIN_MAX = 'custrecord_rin_max';
    const FLD_META_PCT = 'custrecord_meta_pct';
    const FLD_OBJETIVO = 'custrecord_cantidad_objetivo';
    const FLD_DESCUENTO = 'custrecord_pct_descuento';

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
        if (registroId) {
            try {
                const parentLookup = search.lookupFields({
                    type: 'customrecord_fut_condcom',
                    id: registroId,
                    columns: ['custrecord_condcom_nombre']
                });
                if (parentLookup && parentLookup.custrecord_condcom_nombre) {
                    nombrePadre = parentLookup.custrecord_condcom_nombre;
                }
            } catch(e) {}
        }

        const form = serverWidget.createForm({ title: 'Rebates/Metas: ' + nombrePadre, hideNavBar: true });
        form.clientScriptModulePath = './CS_Fut_CondCom_Metas.js';

        form.addField({ id: 'custpage_mode', type: serverWidget.FieldType.TEXT, label: 'Mode' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = mode;

        form.addField({ id: 'custpage_registro_id', type: serverWidget.FieldType.TEXT, label: 'ID Padre' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = registroId;

        const tipoSublista = isEdit ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST;
        const displayModo = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        const sublist = form.addSublist({ id: 'custpage_sublist_metas', type: tipoSublista, label: 'Segmento de Rin' });
        
        const fldNombre = sublist.addField({ id: 'custpage_col_nombre', type: serverWidget.FieldType.TEXT, label: 'Segmento' });
        fldNombre.updateDisplayType({ displayType: displayModo });
        
        // const fldRinMin = sublist.addField({ id: 'custpage_col_rin_min', type: serverWidget.FieldType.INTEGER, label: 'Rin Mínimo' });
        // fldRinMin.updateDisplayType({ displayType: displayModo });
        
        // const fldRinMax = sublist.addField({ id: 'custpage_col_rin_max', type: serverWidget.FieldType.INTEGER, label: 'Rin Máximo' });
        // fldRinMax.updateDisplayType({ displayType: displayModo });
        

        // Cambiamos el tipo a SELECT y le agregamos el 'source' hacia tu lista personalizada
        const fldRinMin = sublist.addField({ id: 'custpage_col_rin_min', type: serverWidget.FieldType.SELECT, label: 'Rin Mínimo', source: 'customlist_nso_list_diametro_rin' });
        fldRinMin.updateDisplayType({ displayType: displayModo });
        
        const fldRinMax = sublist.addField({ id: 'custpage_col_rin_max', type: serverWidget.FieldType.SELECT, label: 'Rin Máximo', source: 'customlist_nso_list_diametro_rin' });
        fldRinMax.updateDisplayType({ displayType: displayModo });


        const fldMeta = sublist.addField({ id: 'custpage_col_meta_pct', type: serverWidget.FieldType.PERCENT, label: 'Meta a Alcanzar (%)' });
        fldMeta.updateDisplayType({ displayType: displayModo });
        
        const fldObj = sublist.addField({ id: 'custpage_col_objetivo', type: serverWidget.FieldType.INTEGER, label: 'Cantidad Objetivo' });
        fldObj.updateDisplayType({ displayType: displayModo });
        
        // const fldDesc = sublist.addField({ id: 'custpage_col_descuento', type: serverWidget.FieldType.PERCENT, label: 'Descuento (%)' });
        // fldDesc.updateDisplayType({ displayType: displayModo });


        // Cambiamos el tipo a SELECT y enlazamos la lista personalizada
        const fldDesc = sublist.addField({ 
            id: 'custpage_col_descuento', 
            type: serverWidget.FieldType.SELECT, 
            label: 'Descuento (%)', 
            source: 'customlist_fut_lista_porcentajes_descu' 
        });
        fldDesc.updateDisplayType({ displayType: displayModo });


        if (isEdit) {
            fldNombre.isMandatory = true;
            fldRinMin.isMandatory = true;
            fldRinMax.isMandatory = true;
            fldMeta.isMandatory = true;
            fldObj.isMandatory = true;
            fldDesc.isMandatory = true;
        }

        if (registroId) {
            let line = 0;
            search.create({
                type: RECORD_META,
                filters: [[FLD_PADRE, 'anyof', registroId]],
                // CAMBIO CLAVE: Buscamos el campo personalizado en lugar de 'name'
                columns: [FLD_NOMBRE_ESCALA, FLD_RIN_MIN, FLD_RIN_MAX, FLD_META_PCT, FLD_OBJETIVO, FLD_DESCUENTO]
            }).run().each(res => {
                // CAMBIO CLAVE: Extraemos el valor del campo personalizado
                let nombre = res.getValue(FLD_NOMBRE_ESCALA);
                if (nombre) sublist.setSublistValue({ id: 'custpage_col_nombre', line: line, value: nombre });

                sublist.setSublistValue({ id: 'custpage_col_rin_min', line: line, value: res.getValue(FLD_RIN_MIN) || 0 });
                sublist.setSublistValue({ id: 'custpage_col_rin_max', line: line, value: res.getValue(FLD_RIN_MAX) || 0 });
                
                let meta = res.getValue(FLD_META_PCT);
                if(meta) sublist.setSublistValue({ id: 'custpage_col_meta_pct', line: line, value: meta });
                
                sublist.setSublistValue({ id: 'custpage_col_objetivo', line: line, value: res.getValue(FLD_OBJETIVO) || 0 });
                
                let descuento = res.getValue(FLD_DESCUENTO);
                if(descuento) sublist.setSublistValue({ id: 'custpage_col_descuento', line: line, value: descuento });
                
                line++;
                return true;
            });
        }

        if (isEdit) {
            form.addSubmitButton({ label: 'Guardar Matriz' });
            form.addButton({ id: 'btn_cancelar', label: 'Cancelar', functionName: 'cancelarEdicionMetas' });
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
                scriptId: 'customscript_fut_sl_condcom_metas',
                deploymentId: 'customdeploy_fut_sl_condcom_metas',
                parameters: { registroId: registroId, mode: 'edit', hideNavBar: 'T' }
            });
            return;
        }

        if (registroId) {
            try {
                search.create({
                    type: RECORD_META,
                    filters: [[FLD_PADRE, 'anyof', registroId]]
                }).run().each(res => {
                    record.delete({ type: RECORD_META, id: res.id });
                    return true;
                });

                const lineCount = req.getLineCount({ group: 'custpage_sublist_metas' });
                for (let i = 0; i < lineCount; i++) {
                    const nombreMeta = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_nombre', line: i });
                    const rinMin = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_rin_min', line: i });
                    const rinMax = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_rin_max', line: i });
                    const metaPct = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_meta_pct', line: i });
                    const objetivo = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_objetivo', line: i });
                    const descuento = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_descuento', line: i });

                    const nuevoRegistro = record.create({ type: RECORD_META });
                    nuevoRegistro.setValue({ fieldId: FLD_PADRE, value: registroId });
                    
                    // CAMBIO CLAVE: Guardamos en el campo personalizado
                    if(nombreMeta) nuevoRegistro.setValue({ fieldId: FLD_NOMBRE_ESCALA, value: nombreMeta });
                    
                    if(rinMin) nuevoRegistro.setValue({ fieldId: FLD_RIN_MIN, value: rinMin });
                    if(rinMax) nuevoRegistro.setValue({ fieldId: FLD_RIN_MAX, value: rinMax });
                    if(metaPct) nuevoRegistro.setValue({ fieldId: FLD_META_PCT, value: parseFloat(metaPct) });
                    if(objetivo) nuevoRegistro.setValue({ fieldId: FLD_OBJETIVO, value: objetivo });
                    // if(descuento) nuevoRegistro.setValue({ fieldId: FLD_DESCUENTO, value: parseFloat(descuento) });
                    // Guardamos directamente el Internal ID de la lista seleccionada
                    if(descuento) nuevoRegistro.setValue({ fieldId: FLD_DESCUENTO, value: descuento });
                    
                    nuevoRegistro.save({ ignoreMandatoryFields: true });
                }
            } catch (e) {
                log.error('Error procesando Rebates/Metas', e.message);
            }
        }

        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:40px;">
                <h3 style="color:#28a745;">¡Rebates y Metas actualizada con éxito!</h3>
                <script>
                    setTimeout(function(){ 
                        if(window.opener) window.opener.location.reload(); 
                        window.close(); 
                    }, 1500);
                </script>
            </body></html>
        `);
    }

    return { onRequest };
});