/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_Fut_CondCom_Panel.js
 *
 * FIX: se agrega el tracking de IDs originales (custpage_ids_originales)
 * y la eliminación en base de datos de las condiciones que el usuario
 * quita del sublist antes de guardar. Antes, una línea borrada en el
 * inline editor simplemente no llegaba en el POST y por lo tanto nunca
 * se procesaba (ni se actualizaba, ni se eliminaba), quedando activa
 * en la base de datos junto con la condición nueva.
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log'], (serverWidget, search, record, redirect, log) => {

    const CUSTOM_RECORD_PADRE = 'customrecord_fut_condcom';
    const FIELD_PROVEEDOR = 'custrecord_condcom_proveedor';
    const FIELD_MARCA = 'custrecord_condcom_marca';
    const FIELD_NOMBRE = 'custrecord_condcom_nombre';
    const FIELD_ACTIVO = 'custrecord_condcom_activo';
    const FIELD_PRONTO_PAGO = 'custrecord_condcom_pronto_pago';
    const FIELD_PRECIO_ESP = 'custrecord_fut_condcom_precio_especial';

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

        // --- FIX: campo oculto para rastrear qué IDs existían al abrir el formulario ---
        const idsOriginalesField = form.addField({ id: 'custpage_ids_originales', type: serverWidget.FieldType.TEXT, label: 'IDs Originales' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        // -------------------------------------------------------------------------------

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

        const tipoSublista = isEdit ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST;
        const displayModo = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        
        const sublist = form.addSublist({ id: 'custpage_sublist', type: tipoSublista, label: 'Reglas de Condiciones Comerciales' });
        
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        const fldProvSub = sublist.addField({ id: 'custpage_col_prov_txt', type: serverWidget.FieldType.TEXT, label: 'Proveedor' });
        fldProvSub.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        
        const fldMarcaSub = sublist.addField({ id: 'custpage_col_marca_txt', type: serverWidget.FieldType.TEXT, label: 'Marca' });
        fldMarcaSub.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        // --- Columnas de Auditoría ---
        const fldCreado = sublist.addField({ id: 'custpage_col_creado', type: serverWidget.FieldType.TEXT, label: 'Fecha de Creación' });
        fldCreado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        const fldModificado = sublist.addField({ id: 'custpage_col_modificado', type: serverWidget.FieldType.TEXT, label: 'Última Modificación' });
        fldModificado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        // ------------------------------------

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayModo });
        
        const fldCondicion = sublist.addField({ id: 'custpage_col_condicion', type: serverWidget.FieldType.TEXT, label: 'Nombre de la Condición' });
        fldCondicion.updateDisplayType({ displayType: displayModo });
        if (isEdit) fldCondicion.isMandatory = true; 
        
        // sublist.addField({ id: 'custpage_col_pp', type: serverWidget.FieldType.PERCENT, label: 'Pronto Pago (%)' }).updateDisplayType({ displayType: displayModo });

        sublist.addField({ 
            id: 'custpage_col_pp', 
            type: serverWidget.FieldType.SELECT, 
            label: 'Pronto Pago (%)', 
            source: 'customlist_fut_lista_porcentajes_descu' 
        }).updateDisplayType({ displayType: displayModo });


        sublist.addField({ id: 'custpage_col_precio_esp', type: serverWidget.FieldType.FLOAT, label: 'Precio Especial' }).updateDisplayType({ displayType: displayModo });
        


// AJUSTE PARA OCUALTAR CONDICIONES POR FILTRO PROVEEDOR 
        // const colAccion = sublist.addField({ id: 'custpage_col_accion', type: serverWidget.FieldType.TEXT, label: 'Matriz de Metas' });
        // if (isEdit) colAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        // Define el ID de tu proveedor especial (¡Cambia el '123' por el Internal ID real de JK TORNEL!)
        const ID_JK_TORNEL = '1978'; 

        const colAccion = sublist.addField({ id: 'custpage_col_accion', type: serverWidget.FieldType.TEXT, label: 'Matriz de Metas' });
        
        if (proveedorId === ID_JK_TORNEL) {
            // Si es JK Tornel, escondemos la columna por completo
            colAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        } else if (isEdit) {
            // Si es cualquier otro proveedor en modo edición, la mostramos normal
            colAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        }

        if (proveedorId && marcaId) {
            let lineIndex = 0;

            // --- FIX: acumulador de IDs existentes en este render ---
            const idsOriginales = [];
            // ---------------------------------------------------------
            
            // Columas de auditoría: fecha de creación y última modificación
            search.create({
                type: CUSTOM_RECORD_PADRE,
                filters: [[FIELD_PROVEEDOR, 'anyof', proveedorId], 'AND', [FIELD_MARCA, 'anyof', marcaId]],
                columns: ['internalid', FIELD_ACTIVO, FIELD_NOMBRE, FIELD_PRONTO_PAGO, FIELD_PRECIO_ESP, FIELD_PROVEEDOR, FIELD_MARCA, 'created', 'lastmodified']
            }).run().each(res => {
                
                const idRegistro = res.id;

                // --- FIX: registrar este ID como "existente antes de editar" ---
                idsOriginales.push(idRegistro);
                // -----------------------------------------------------------------
                
                const provTxt = res.getText(FIELD_PROVEEDOR) || res.getValue(FIELD_PROVEEDOR) || '---';
                const marcaTxt = res.getText(FIELD_MARCA) || res.getValue(FIELD_MARCA) || '---';
                
                const fechaCreacion = res.getValue('created') || '';
                const fechaModificacion = res.getValue('lastmodified') || '';

                const estaActivo = res.getValue(FIELD_ACTIVO);
                const nombre = res.getValue(FIELD_NOMBRE) || res.getText(FIELD_NOMBRE) || 'Sin Nombre';
                const prontoPago = res.getValue(FIELD_PRONTO_PAGO);
                const precioEspecial = res.getValue(FIELD_PRECIO_ESP);

                sublist.setSublistValue({ id: 'custpage_col_id', line: lineIndex, value: idRegistro });
                sublist.setSublistValue({ id: 'custpage_col_prov_txt', line: lineIndex, value: provTxt });
                sublist.setSublistValue({ id: 'custpage_col_marca_txt', line: lineIndex, value: marcaTxt });
                
                if (fechaCreacion) sublist.setSublistValue({ id: 'custpage_col_creado', line: lineIndex, value: fechaCreacion });
                if (fechaModificacion) sublist.setSublistValue({ id: 'custpage_col_modificado', line: lineIndex, value: fechaModificacion });

                sublist.setSublistValue({ id: 'custpage_col_activo', line: lineIndex, value: (estaActivo === 'T' || estaActivo === true) ? 'T' : 'F' });
                sublist.setSublistValue({ id: 'custpage_col_condicion', line: lineIndex, value: nombre });
                
                if (prontoPago !== null && prontoPago !== '') {
                    sublist.setSublistValue({ id: 'custpage_col_pp', line: lineIndex, value: prontoPago });
                }

                if (precioEspecial !== null && precioEspecial !== '') {
                    sublist.setSublistValue({ id: 'custpage_col_precio_esp', line: lineIndex, value: precioEspecial });
                }
                
// AJUSTE PARA Evitar inyectar los botones de "Ver Metas"
                // const txtLink = isEdit ? 'Configurar Metas' : 'Ver Metas';
                // sublist.setSublistValue({ 
                //     id: 'custpage_col_accion', 
                //     line: lineIndex, 
                //     value: `<a href="javascript:void(0);" onclick="abrirMatrizMetas('${idRegistro}', '${mode}')" class="dottedlink" style="font-weight:bold;">${txtLink}</a>` 
                // });
                

                // Solo inyectamos los links si NO es el proveedor JK Tornel
                if (proveedorId !== ID_JK_TORNEL) {
                    const txtLink = isEdit ? 'Configurar Metas' : 'Ver Metas';
                    sublist.setSublistValue({ 
                        id: 'custpage_col_accion', 
                        line: lineIndex, 
                        value: `<a href="javascript:void(0);" onclick="abrirMatrizMetas('${idRegistro}', '${mode}')" class="dottedlink" style="font-weight:bold;">${txtLink}</a>` 
                    });
                }
                
                lineIndex++;
                return true;
            });

            // --- FIX: persistir la lista de IDs originales en el campo oculto ---
            idsOriginalesField.defaultValue = idsOriginales.join(',');
            // -----------------------------------------------------------------------
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

        // --- FIX: IDs que existían cuando se abrió el formulario de edición ---
        const idsOriginales = (req.parameters.custpage_ids_originales || '')
            .split(',')
            .map(id => id.trim())
            .filter(id => id);

        // --- FIX: IDs que sí llegaron en este submit (líneas que el usuario conservó) ---
        const idsEnviados = [];

        const lineCount = req.getLineCount({ group: 'custpage_sublist' });
        
        for (let i = 0; i < lineCount; i++) {
            const idRegistro = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_id', line: i });
            const estaActivo = (req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_activo', line: i }) === 'T');
            const nombreCond = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_condicion', line: i });
            const prontoPago = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_pp', line: i });
            const precioEspecial = req.getSublistValue({ group: 'custpage_sublist', name: 'custpage_col_precio_esp', line: i });

            if (idRegistro) {
                idsEnviados.push(String(idRegistro).trim());
                try {
                    const rec = record.load({ type: CUSTOM_RECORD_PADRE, id: idRegistro });
                    rec.setValue({ fieldId: FIELD_ACTIVO, value: estaActivo });
                    if (nombreCond) rec.setValue({ fieldId: FIELD_NOMBRE, value: nombreCond });
                    // rec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? parseFloat(prontoPago) : 0 });
                    // Guardamos el ID de la lista. Si viene vacío, guardamos null.
                    rec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? prontoPago : null });
                    rec.setValue({ fieldId: FIELD_PRECIO_ESP, value: precioEspecial ? parseFloat(precioEspecial) : null });
                    rec.save({ ignoreMandatoryFields: true });
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
                    // nuevoRec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? parseFloat(prontoPago) : 0 });
                    // Lo mismo para los registros nuevos
                    nuevoRec.setValue({ fieldId: FIELD_PRONTO_PAGO, value: prontoPago ? prontoPago : null });
                    nuevoRec.setValue({ fieldId: FIELD_PRECIO_ESP, value: precioEspecial ? parseFloat(precioEspecial) : null });
                    nuevoRec.save({ ignoreMandatoryFields: true });
                } catch (e) {
                    log.error('Error creando nueva Cabecera', e.message);
                }
            }
        }

        // --- FIX: eliminar en base de datos las condiciones que el usuario quitó ---
        // Cualquier ID que existía al abrir el formulario pero que no llegó en este
        // submit fue borrado por el usuario en el sublist (inline editor) y debe
        // eliminarse también en la base de datos.
        const idsAEliminar = idsOriginales.filter(id => idsEnviados.indexOf(id) === -1);

        idsAEliminar.forEach(id => {
            try {
                record.delete({ type: CUSTOM_RECORD_PADRE, id: id });
            } catch (e) {
                log.error(`Error eliminando condición ID ${id}`, e.message);
            }
        });
        // -----------------------------------------------------------------------------

        redirect.toSuitelet({
            scriptId: 'customscript_fut_sl_condcom_panel',
            deploymentId: 'customdeploy_fut_sl_condcom_panel',
            parameters: { proveedor: proveedorId, marca: marcaId, mode: 'view' }
        });
    }

    return { onRequest };
});