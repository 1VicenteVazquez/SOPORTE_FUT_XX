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

        const form = serverWidget.createForm({ title: 'Matriz de Metas: ' + nombrePadre, hideNavBar: true });
        
        form.clientScriptModulePath = './CS_Fut_CondCom_Metas.js';

        form.addField({ id: 'custpage_mode', type: serverWidget.FieldType.TEXT, label: 'Mode' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = mode;

        form.addField({ id: 'custpage_registro_id', type: serverWidget.FieldType.TEXT, label: 'ID Padre' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = registroId;

        // Si está en view, usamos LIST (solo lectura); si está en edit, INLINEEDITOR para agregar/editar filas
        const tipoSublista = isEdit ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST;
        const sublist = form.addSublist({ id: 'custpage_sublist_metas', type: tipoSublista, label: 'Escalas por Segmento de Rin' });
        
        sublist.addField({ id: 'custpage_col_nombre', type: serverWidget.FieldType.TEXT, label: 'Nombre de la Escala' }).isMandatory = true;
        sublist.addField({ id: 'custpage_col_rin_min', type: serverWidget.FieldType.INTEGER, label: 'Rin Mínimo' }).isMandatory = true;
        sublist.addField({ id: 'custpage_col_rin_max', type: serverWidget.FieldType.INTEGER, label: 'Rin Máximo' }).isMandatory = true;
        sublist.addField({ id: 'custpage_col_meta_pct', type: serverWidget.FieldType.PERCENT, label: 'Meta a Alcanzar (%)' }).isMandatory = true;
        sublist.addField({ id: 'custpage_col_objetivo', type: serverWidget.FieldType.INTEGER, label: 'Cantidad Objetivo (Items)' }).isMandatory = true;
        sublist.addField({ id: 'custpage_col_descuento', type: serverWidget.FieldType.PERCENT, label: 'Descuento (%)' }).isMandatory = true;

        if (registroId) {
            let line = 0;
            search.create({
                type: RECORD_META,
                filters: [[FLD_PADRE, 'anyof', registroId]],
                columns: ['name', FLD_RIN_MIN, FLD_RIN_MAX, FLD_META_PCT, FLD_OBJETIVO, FLD_DESCUENTO]
            }).run().each(res => {
                let nombre = res.getValue('name');
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

        // Botonera alineada al comportamiento del Panel Principal
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

        // Si estaba en view y le dio al botón de "Editar", redirigimos el popup a modo edit
        if (mode === 'view') {
            redirect.toSuitelet({
                scriptId: 'customscript_fut_sl_condcom_metas',
                deploymentId: 'customdeploy_fut_sl_condcom_metas',
                parameters: { registroId: registroId, mode: 'edit', hideNavBar: 'T' }
            });
            return;
        }

        // Si estaba en edit, procesamos el guardado (Wipe & Replace)
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
                    
                    if(nombreMeta) nuevoRegistro.setValue({ fieldId: 'name', value: nombreMeta });
                    if(rinMin) nuevoRegistro.setValue({ fieldId: FLD_RIN_MIN, value: rinMin });
                    if(rinMax) nuevoRegistro.setValue({ fieldId: FLD_RIN_MAX, value: rinMax });
                    if(metaPct) nuevoRegistro.setValue({ fieldId: FLD_META_PCT, value: parseFloat(metaPct) });
                    if(objetivo) nuevoRegistro.setValue({ fieldId: FLD_OBJETIVO, value: objetivo });
                    if(descuento) nuevoRegistro.setValue({ fieldId: FLD_DESCUENTO, value: parseFloat(descuento) });
                    
                    nuevoRegistro.save({ ignoreMandatoryFields: true });
                }
            } catch (e) {
                log.error('Error procesando Matriz de Metas', e.message);
            }
        }

        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:40px;">
                <h3 style="color:#28a745;">¡Matriz de metas actualizada con éxito!</h3>
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