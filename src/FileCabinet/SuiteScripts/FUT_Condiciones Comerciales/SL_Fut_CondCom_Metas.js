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
    const FLD_ACTIVO = 'custrecord_fut_activo_inactivo';

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

        // Columna oculta para guardar el Internal ID de cada línea
        const fldMetaId = sublist.addField({ id: 'custpage_col_meta_id', type: serverWidget.FieldType.TEXT, label: 'Internal ID' });
        fldMetaId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        const fldCreado = sublist.addField({ id: 'custpage_col_creado', type: serverWidget.FieldType.TEXT, label: 'Fecha de Creación' });
        fldCreado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldModificado = sublist.addField({ id: 'custpage_col_modificado', type: serverWidget.FieldType.TEXT, label: 'Última Modificación' });
        fldModificado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldCreador = sublist.addField({ id: 'custpage_col_creador', type: serverWidget.FieldType.TEXT, label: 'Creado Por' });
        fldCreador.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldActivo = sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' });
        fldActivo.updateDisplayType({ displayType: displayModo });

        const fldNombre = sublist.addField({ 
            id: 'custpage_col_nombre', 
            type: serverWidget.FieldType.SELECT, 
            label: 'Segmento',
            source: 'customlist_fut_lista_tipo_segmento'
        });
        fldNombre.updateDisplayType({ displayType: displayModo });

        const fldRinMin = sublist.addField({ id: 'custpage_col_rin_min', type: serverWidget.FieldType.SELECT, label: 'Rin Mínimo' });
        fldRinMin.updateDisplayType({ displayType: displayModo });
        fldRinMin.addSelectOption({ value: '', text: '' });

        const fldRinMax = sublist.addField({ id: 'custpage_col_rin_max', type: serverWidget.FieldType.SELECT, label: 'Rin Máximo' });
        fldRinMax.updateDisplayType({ displayType: displayModo });
        fldRinMax.addSelectOption({ value: '', text: '' });

        search.create({
            type: 'customlist_nso_list_diametro_rin',
            columns: ['name']
        }).run().each((res) => {
            fldRinMin.addSelectOption({ value: res.id, text: res.getValue('name') });
            fldRinMax.addSelectOption({ value: res.id, text: res.getValue('name') });
            return true;
        });

        const fldMeta = sublist.addField({
            id: 'custpage_col_meta_pct',
            type: isEdit ? serverWidget.FieldType.FLOAT : serverWidget.FieldType.TEXT,
            label: 'Meta a Alcanzar (%)'
        });
        fldMeta.updateDisplayType({ displayType: displayModo });

        const fldObj = sublist.addField({ id: 'custpage_col_objetivo', type: serverWidget.FieldType.INTEGER, label: 'Cantidad Objetivo' });
        fldObj.updateDisplayType({ displayType: displayModo });
        
        const fldDesc = sublist.addField({ 
            id: 'custpage_col_descuento', 
            type: serverWidget.FieldType.SELECT, 
            label: 'Descuento (%)'
        });
        fldDesc.updateDisplayType({ displayType: displayModo });
        fldDesc.addSelectOption({ value: '', text: '' });

        search.create({
            type: 'customlist_fut_lista_porcentajes_descu',
            columns: ['name']
        }).run().each((res) => {
            fldDesc.addSelectOption({ value: res.id, text: res.getValue('name') });
            return true;
        });

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
                // Agregamos 'created', 'lastmodified' y 'owner' a la búsqueda
                columns: ['internalid', FLD_ACTIVO, FLD_NOMBRE_ESCALA, FLD_RIN_MIN, FLD_RIN_MAX, FLD_META_PCT, FLD_OBJETIVO, FLD_DESCUENTO, 'created', 'lastmodified', 'owner']
            }).run().each(res => {
                sublist.setSublistValue({ id: 'custpage_col_meta_id', line: line, value: res.id });

                const fechaCreacion = res.getValue('created') || '';
                const fechaModificacion = res.getValue('lastmodified') || '';
                const creadorNombre = res.getText('owner') || res.getValue('owner') || '---';

                if (fechaCreacion) sublist.setSublistValue({ id: 'custpage_col_creado', line: line, value: fechaCreacion });
                if (fechaModificacion) sublist.setSublistValue({ id: 'custpage_col_modificado', line: line, value: fechaModificacion });
                sublist.setSublistValue({ id: 'custpage_col_creador', line: line, value: creadorNombre });

                let estaActivo = res.getValue(FLD_ACTIVO);
                sublist.setSublistValue({ id: 'custpage_col_activo', line: line, value: (estaActivo === true || estaActivo === 'T') ? 'T' : 'F' });

                let nombre = res.getValue(FLD_NOMBRE_ESCALA);
                if (nombre) sublist.setSublistValue({ id: 'custpage_col_nombre', line: line, value: nombre });

                sublist.setSublistValue({ id: 'custpage_col_rin_min', line: line, value: res.getValue(FLD_RIN_MIN) || 0 });
                sublist.setSublistValue({ id: 'custpage_col_rin_max', line: line, value: res.getValue(FLD_RIN_MAX) || 0 });

                let meta = res.getValue(FLD_META_PCT);
                if (meta) {
                    const metaFormateada = isEdit ? meta : (parseFloat(meta).toFixed(1) + '%');
                    sublist.setSublistValue({ id: 'custpage_col_meta_pct', line: line, value: metaFormateada });
                }

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
                const lineCount = req.getLineCount({ group: 'custpage_sublist_metas' });
                let submittedIds = [];

                for (let i = 0; i < lineCount; i++) {
                    let metaId = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_meta_id', line: i });
                    if (metaId) submittedIds.push(metaId);
                }

                search.create({
                    type: RECORD_META,
                    filters: [[FLD_PADRE, 'anyof', registroId]]
                }).run().each(res => {
                    if (!submittedIds.includes(res.id)) {
                        record.delete({ type: RECORD_META, id: res.id });
                    }
                    return true;
                });

                for (let i = 0; i < lineCount; i++) {
                    const metaId = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_meta_id', line: i });
                    const activoVal = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_activo', line: i });
                    const isActivo = (activoVal === 'T' || activoVal === 'true' || activoVal === true);
                    const nombreMeta = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_nombre', line: i });
                    const rinMin = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_rin_min', line: i });
                    const rinMax = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_rin_max', line: i });
                    const metaPct = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_meta_pct', line: i });
                    const objetivo = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_objetivo', line: i });
                    const descuento = req.getSublistValue({ group: 'custpage_sublist_metas', name: 'custpage_col_descuento', line: i });

                    let registroMeta;

                    if (metaId) {
                        registroMeta = record.load({ type: RECORD_META, id: metaId });
                    } else {
                        registroMeta = record.create({ type: RECORD_META });
                        registroMeta.setValue({ fieldId: FLD_PADRE, value: registroId });
                    }

                    registroMeta.setValue({ fieldId: FLD_ACTIVO, value: isActivo });
                    if(nombreMeta) registroMeta.setValue({ fieldId: FLD_NOMBRE_ESCALA, value: Number(nombreMeta) });
                    if(rinMin) registroMeta.setValue({ fieldId: FLD_RIN_MIN, value: rinMin });
                    if(rinMax) registroMeta.setValue({ fieldId: FLD_RIN_MAX, value: rinMax });
                    if(metaPct) registroMeta.setValue({ fieldId: FLD_META_PCT, value: parseFloat(metaPct) });
                    if(objetivo) registroMeta.setValue({ fieldId: FLD_OBJETIVO, value: objetivo });
                    if(descuento) registroMeta.setValue({ fieldId: FLD_DESCUENTO, value: descuento });

                    registroMeta.save({ ignoreMandatoryFields: true });
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