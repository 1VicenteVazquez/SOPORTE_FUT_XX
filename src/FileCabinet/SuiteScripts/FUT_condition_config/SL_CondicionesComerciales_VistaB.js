/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaB.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/task', 'N/redirect', 'N/runtime', 'N/log'], (serverWidget, search, record, task, redirect, runtime, log) => {
    
    const PAGE_SIZE = 25; 
    const CUSTOM_RECORD_ESCALAS = 'customrecord_fut_escalas_meta';
    const CUSTOM_RECORD_DETALLE = 'customrecord_fut_condicion_detalle';
    const SCRIPT_ID_MR_ESCALAS = 'customscript_mr_aplicar_escalas'; 

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') procesarGuardado(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const isEdit = (params.mode === 'edit');
        const padreId = params.padreId;
        
        const titulo = isEdit ? 'Asignación de Condiciones y Escalas (Edición)' : 'Asignación de Condiciones y Escalas (Consulta)';
        
        const form = serverWidget.createForm({ title: titulo, hideNavBar: true });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaB.js';

        if (params.exito === 'T') {
            let msgFld = form.addField({ id: 'custpage_msg_exito', type: serverWidget.FieldType.INLINEHTML, label: 'Mensaje' });
            msgFld.defaultValue = `
                <div style="background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 12px; margin-bottom: 15px; border-radius: 4px; font-family: sans-serif; font-size: 14px; font-weight: bold;">
                    ¡Segmentos guardados correctamente  y proceso masivo lanzado en segundo plano con éxito!
                </div>
            `;
        }

        form.addField({ id: 'custpage_padre_id', type: serverWidget.FieldType.TEXT, label: 'Padre' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = padreId;
        form.addField({ id: 'custpage_tipo_id', type: serverWidget.FieldType.TEXT, label: 'Tipo' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.tipo;
        form.addField({ id: 'custpage_marca_id', type: serverWidget.FieldType.TEXT, label: 'Marca' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.marca;
        form.addField({ id: 'custpage_proveedor_id', type: serverWidget.FieldType.TEXT, label: 'Prov' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.proveedor;
        form.addField({ id: 'custpage_payload', type: serverWidget.FieldType.LONGTEXT, label: 'Payload' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        form.addField({ id: 'custpage_accion_masiva', type: serverWidget.FieldType.TEXT, label: 'Acción Masiva' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = 'F';

        form.addTab({ id: 'custpage_tab_articulos', label: '1. Vista General de Artículos (Excepciones)' });
        form.addTab({ id: 'custpage_tab_escalas', label: '2. Escalas por Segmento de Rin (Maestro)' });

        if (isEdit) {
            form.addSubmitButton({ label: 'Guardar Cambios' });
            
            form.addButton({ 
                id: 'custpage_btn_aplicar_escalas', 
                label: 'Aplicar Escalas a Artículos', 
                functionName: 'aplicarEscalasMasivas', 
                tab: 'custpage_tab_escalas' 
            });

            form.addButton({ id: 'btn_cerrar', label: 'Cancelar', functionName: 'cerrarPopup' });
        } else {
            form.addButton({ id: 'btn_cerrar', label: 'Cerrar Ventana', functionName: 'cerrarPopup' });
        }

        // PESTAÑA 1
        form.addFieldGroup({ id: 'custpage_fg_filtros', label: 'Filtros de Búsqueda de Artículos', tab: 'custpage_tab_articulos' });
        form.addField({ id: 'custpage_filtro', type: serverWidget.FieldType.TEXT, label: 'Buscar por Código / Nombre', container: 'custpage_fg_filtros', tab: 'custpage_tab_articulos' }).defaultValue = params.filtro || '';
        form.addField({ id: 'custpage_filtro_rin', type: serverWidget.FieldType.TEXT, label: 'Buscar por Tamaño de Rin Específico', container: 'custpage_fg_filtros', tab: 'custpage_tab_articulos' }).defaultValue = params.filtroRin || '';

        const htmlPaginacion = form.addField({ id: 'custpage_html_paginacion', type: serverWidget.FieldType.INLINEHTML, label: ' ', tab: 'custpage_tab_articulos' });

        const sublist = form.addSublist({ id: 'custpage_sublist', type: serverWidget.SublistType.LIST, label: 'Artículos', tab: 'custpage_tab_articulos' });
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'Reg ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        const displayModo = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayModo });
        sublist.addField({ id: 'custpage_col_item', type: serverWidget.FieldType.SELECT, label: 'Artículo', source: 'item' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        sublist.addField({ id: 'custpage_col_rin', type: serverWidget.FieldType.TEXT, label: 'Tamaño de Rin' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        sublist.addField({ id: 'custpage_col_descripcion', type: serverWidget.FieldType.TEXT, label: 'Descripción Porcentaje' }).updateDisplayType({ displayType: displayModo });

        const fldPorcentaje = sublist.addField({ id: 'custpage_col_porcentaje', type: serverWidget.FieldType.SELECT, label: 'Porcentaje de Descuento' });
        fldPorcentaje.updateDisplayType({ displayType: displayModo });
        fldPorcentaje.addSelectOption({ value: '', text: '- N/A -' });
        for (let i = 1; i <= 1000; i++) {
            let val = i / 10;
            fldPorcentaje.addSelectOption({ value: val.toString(), text: val.toFixed(1) + '%' });
        }

        if (params.marca && padreId) {
            cargarArticulos(sublist, params.marca, padreId, params.filtro || '', params.filtroRin || '', parseInt(params.page) || 0, htmlPaginacion);
        }

        // PESTAÑA 2
        const sublistEscalas = form.addSublist({ id: 'custpage_sublist_escalas', type: serverWidget.SublistType.INLINEEDITOR, label: 'Escalas por Segmento de Rin', tab: 'custpage_tab_escalas' });
        sublistEscalas.addField({ id: 'custpage_col_esc_id', type: serverWidget.FieldType.TEXT, label: 'ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        const displayEscMode = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        
        sublistEscalas.addField({ id: 'custpage_col_esc_min', type: serverWidget.FieldType.INTEGER, label: 'Rin Mínimo' }).updateDisplayType({ displayType: displayEscMode });
        sublistEscalas.addField({ id: 'custpage_col_esc_max', type: serverWidget.FieldType.INTEGER, label: 'Rin Máximo' }).updateDisplayType({ displayType: displayEscMode });
        
        const fldEscMeta = sublistEscalas.addField({ id: 'custpage_col_esc_meta', type: serverWidget.FieldType.SELECT, label: 'Meta a Alcanzar (%)' });
        fldEscMeta.updateDisplayType({ displayType: displayEscMode });
        fldEscMeta.addSelectOption({ value: '', text: '- Seleccione -' });
        for (let i = 1; i <= 1000; i++) {
            let val = i / 10;
            fldEscMeta.addSelectOption({ value: val.toString(), text: val.toFixed(1) + '%' });
        }

        sublistEscalas.addField({ id: 'custpage_col_esc_cuota', type: serverWidget.FieldType.INTEGER, label: 'Cantidad Objetivo (Pzas)' }).updateDisplayType({ displayType: displayEscMode });
        
        const fldEscDesc = sublistEscalas.addField({ id: 'custpage_col_esc_desc', type: serverWidget.FieldType.SELECT, label: 'Descuento / Premio (%)' });
        fldEscDesc.updateDisplayType({ displayType: displayEscMode });
        fldEscDesc.addSelectOption({ value: '', text: '- Seleccione -' });
        for (let i = 1; i <= 1000; i++) {
            let val = i / 10;
            fldEscDesc.addSelectOption({ value: val.toString(), text: val.toFixed(1) + '%' });
        }

        if (padreId) {
            let escLine = 0;
            search.create({
                type: CUSTOM_RECORD_ESCALAS,
                filters: [['custrecord_fut_em_padre', 'anyof', padreId]],
                columns: ['internalid', 'custrecord_fut_em_rin_min', 'custrecord_fut_em_rin_max', 'custrecord_fut_em_meta_pct', 'custrecord_fut_em_cuota', 'custrecord_fut_em_descuento_pct']
            }).run().each(res => {
                sublistEscalas.setSublistValue({ id: 'custpage_col_esc_id', line: escLine, value: res.id });
                
                let min = res.getValue('custrecord_fut_em_rin_min');
                let max = res.getValue('custrecord_fut_em_rin_max');
                let meta = res.getValue('custrecord_fut_em_meta_pct');
                let cuota = res.getValue('custrecord_fut_em_cuota');
                let desc = res.getValue('custrecord_fut_em_descuento_pct');

                if (min !== null && min !== '') sublistEscalas.setSublistValue({ id: 'custpage_col_esc_min', line: escLine, value: String(min) });
                if (max !== null && max !== '') sublistEscalas.setSublistValue({ id: 'custpage_col_esc_max', line: escLine, value: String(max) });
                
                if (meta !== null && meta !== '') {
                    let numMetaPct = parseFloat(meta);
                    if (!isNaN(numMetaPct)) sublistEscalas.setSublistValue({ id: 'custpage_col_esc_meta', line: escLine, value: numMetaPct.toString() });
                }

                if (cuota !== null && cuota !== '') sublistEscalas.setSublistValue({ id: 'custpage_col_esc_cuota', line: escLine, value: String(cuota) });
                
                if (desc !== null && desc !== '') {
                    let numDescPct = parseFloat(desc);
                    if (!isNaN(numDescPct)) sublistEscalas.setSublistValue({ id: 'custpage_col_esc_desc', line: escLine, value: numDescPct.toString() });
                }
                escLine++;
                return true;
            });
        }

        context.response.writePage(form);
    }

    function cargarArticulos(sublist, marcaId, padreId, filtroTexto, filtroRinTexto, pageIndex, htmlPaginacion) {
        const registrosHijo = {};
        search.create({
            type: CUSTOM_RECORD_DETALLE,
            filters: [['custrecord_fut_condicion_individual', 'anyof', padreId]],
            columns: ['custrecord_fut_articulo', 'custrecord_fut_activo', 'custrecord_fut_porcentaje', 'custrecord_fut_descripcion']
        }).run().each(res => {
            registrosHijo[res.getValue('custrecord_fut_articulo')] = {
                id: res.id,
                activo: res.getValue('custrecord_fut_activo') === 'T',
                pct: parseFloat(res.getValue('custrecord_fut_porcentaje')),
                desc: res.getValue('custrecord_fut_descripcion')
            };
            return true;
        });

        let filtrosItem = [['custitem_nso_marca', 'anyof', marcaId], 'AND', ['isinactive', 'is', 'F']];
        if (filtroTexto) filtrosItem.push('AND', [['itemid', 'contains', filtroTexto], 'OR', ['displayname', 'contains', filtroTexto]]);
        if (filtroRinTexto) {
            filtrosItem.push('AND', ['formulatext: TO_CHAR({custitem_diametro_rin})', 'contains', filtroRinTexto]);
        }

        const pagedData = search.create({ 
            type: search.Type.ITEM, 
            filters: filtrosItem, 
            columns: ['internalid', 'itemid', 'custitem_diametro_rin'] 
        }).runPaged({ pageSize: PAGE_SIZE });

        const totalPages = pagedData.pageRanges.length;
        if (totalPages > 0) {
            let htmlBtns = `<div style="margin: 10px 0; font-family: Open Sans, Helvetica, sans-serif; font-size: 13px; color: #333;">`;
            htmlBtns += `<span style="margin-right: 15px;">Página ${pageIndex + 1} de ${totalPages}</span>`;
            
            if (pageIndex > 0) {
                htmlBtns += `<a href="#" onclick="window.cambiarPagina(0); return false;" style="color: #255599; text-decoration: none; margin-right: 5px;" title="Primera">&laquo; Primera</a> | `;
                htmlBtns += `<a href="#" onclick="window.cambiarPagina(${pageIndex - 1}); return false;" style="color: #255599; text-decoration: none; margin-right: 5px;" title="Anterior">&lsaquo; Anterior</a> | `;
            }
            
            let startPage = Math.max(0, pageIndex - 2);
            let endPage = Math.min(totalPages - 1, pageIndex + 2);
            
            for (let i = startPage; i <= endPage; i++) {
                let isCurrent = (i === pageIndex);
                let style = isCurrent ? 'font-weight: bold; color: #000; text-decoration: none;' : 'color: #255599; text-decoration: none;';
                htmlBtns += `<a href="#" onclick="window.cambiarPagina(${i}); return false;" style="${style} margin: 0 5px;">${i+1}</a>`;
                if (i < endPage) htmlBtns += ` | `;
            }
            
            if (pageIndex < totalPages - 1) {
                htmlBtns += ` | <a href="#" onclick="window.cambiarPagina(${pageIndex + 1}); return false;" style="color: #255599; text-decoration: none; margin-left: 5px;" title="Siguiente">Siguiente &rsaquo;</a>`;
                htmlBtns += ` | <a href="#" onclick="window.cambiarPagina(${totalPages - 1}); return false;" style="color: #255599; text-decoration: none; margin-left: 5px;" title="Última">Última &raquo;</a>`;
            }
            htmlBtns += `</div>`;
            htmlPaginacion.defaultValue = htmlBtns;

            let line = 0;
            let currentPageData = pagedData.fetch({ index: pageIndex }).data;

            currentPageData.sort((a, b) => {
                const tieneA = registrosHijo[String(a.id)] ? 1 : 0;
                const tieneB = registrosHijo[String(b.id)] ? 1 : 0;
                return tieneB - tieneA;
            });

            currentPageData.forEach(res => {
                const itemIdStr = String(res.id);
                const dataHijo = registrosHijo[itemIdStr];
                const tamanoRinRaw = res.getText('custitem_diametro_rin') || res.getValue('custitem_diametro_rin') || '';
                const txtPorDefecto = "REBATE"; 
                
                sublist.setSublistValue({ id: 'custpage_col_item', line: line, value: res.id });
                if (tamanoRinRaw) sublist.setSublistValue({ id: 'custpage_col_rin', line: line, value: String(tamanoRinRaw) });
                
                if (dataHijo) {
                    sublist.setSublistValue({ id: 'custpage_col_id', line: line, value: dataHijo.id });
                    sublist.setSublistValue({ id: 'custpage_col_activo', line: line, value: dataHijo.activo ? 'T' : 'F' });
                    
                    let descFinal = (dataHijo.desc !== null && dataHijo.desc !== undefined) ? dataHijo.desc : txtPorDefecto;
                    if (descFinal !== '') sublist.setSublistValue({ id: 'custpage_col_descripcion', line: line, value: descFinal });
                    
                    if (dataHijo.pct !== null && dataHijo.pct !== '') {
                        let numPct = parseFloat(dataHijo.pct);
                        if (!isNaN(numPct)) {
                            // Corrección visual para que el select reconozca el valor decimal crudo y lo pinte correctamente
                            if (numPct > 0 && numPct < 1) {
                                numPct = numPct * 100;
                            }
                            numPct = Math.round(numPct * 10) / 10; // limpia drift de flotantes (ej 3.7000000004 -> 3.7)
                            sublist.setSublistValue({ id: 'custpage_col_porcentaje', line: line, value: numPct.toString() });
                        }
                    }
                } else {
                    sublist.setSublistValue({ id: 'custpage_col_descripcion', line: line, value: txtPorDefecto });
                }
                line++;
            });
        } else {
            htmlPaginacion.defaultValue = `<div style="margin: 10px 0; font-family: Open Sans, Helvetica, sans-serif; color: #888;">No se encontraron artículos.</div>`;
        }
    }

    function procesarGuardado(context) {
        const req = context.request;

        const safeText = (val) => {
            if (val === null || val === undefined) return '';
            try {
                if (typeof val === 'object') return '';
                let str = String(val).trim();
                return (str === 'null' || str.includes('ScriptNullObjectAdapter')) ? '' : str;
            } catch (e) {
                return '';
            }
        };

        const padreId = safeText(req.parameters.custpage_padre_id);
        const marcaId = safeText(req.parameters.custpage_marca_id);
        const tipoId = safeText(req.parameters.custpage_tipo_id);
        const proveedorId = safeText(req.parameters.custpage_proveedor_id);
        const payloadArticulos = safeText(req.parameters.custpage_payload);
        const accionMasiva = safeText(req.parameters.custpage_accion_masiva);

        // PASO 1: GUARDAR ESCALAS
        const lineCountEsc = req.getLineCount({ group: 'custpage_sublist_escalas' }) || 0;
        const idsExistentesEsc = [];
        const escalasNuevasParaMR = [];

        if (padreId !== '') {
            search.create({
                type: CUSTOM_RECORD_ESCALAS,
                filters: [['custrecord_fut_em_padre', 'anyof', padreId]],
                columns: ['internalid']
            }).run().each(res => {
                if (res && res.id) idsExistentesEsc.push(String(res.id));
                return true;
            });
        }

        const idsEnviadosEsc = [];
        for (let i = 0; i < lineCountEsc; i++) {
            try {
                let idEsc = safeText(req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_id', line: i }));
                let rinMin = safeText(req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_min', line: i }));
                let rinMax = safeText(req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_max', line: i }));
                let metaSelect = safeText(req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_meta', line: i }));
                let cuota = safeText(req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_cuota', line: i }));
                let descSelect = safeText(req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_desc', line: i }));

                if (rinMin === '' || rinMax === '' || descSelect === '') continue;

                if (idEsc !== '') idsEnviadosEsc.push(idEsc);

                let valRinMin = parseInt(rinMin, 10);
                let valRinMax = parseInt(rinMax, 10);
                let valMeta = metaSelect !== '' ? parseFloat(metaSelect) : null;
                let valCuota = cuota !== '' ? parseInt(cuota, 10) : null;
                let valDesc = parseFloat(descSelect);

                let recEsc = idEsc !== '' ? record.load({ type: CUSTOM_RECORD_ESCALAS, id: idEsc }) : record.create({ type: CUSTOM_RECORD_ESCALAS });
                
                recEsc.setValue({ fieldId: 'custrecord_fut_em_padre', value: padreId !== '' ? padreId : null });
                recEsc.setValue({ fieldId: 'custrecord_fut_em_rin_min', value: isNaN(valRinMin) ? null : valRinMin });
                recEsc.setValue({ fieldId: 'custrecord_fut_em_rin_max', value: isNaN(valRinMax) ? null : valRinMax });
                recEsc.setValue({ fieldId: 'custrecord_fut_em_meta_pct', value: valMeta });
                recEsc.setValue({ fieldId: 'custrecord_fut_em_cuota', value: valCuota });
                recEsc.setValue({ fieldId: 'custrecord_fut_em_descuento_pct', value: isNaN(valDesc) ? null : valDesc });
                
                recEsc.save({ ignoreMandatoryFields: true });

                if (!isNaN(valRinMin) && !isNaN(valRinMax) && !isNaN(valDesc)) {
                    escalasNuevasParaMR.push({
                        min: valRinMin,
                        max: valRinMax,
                        descuentoNum: valDesc
                    });
                }
            } catch (e) {
                log.error('Error guardando escala individual', e.message);
            }
        }

        idsExistentesEsc.forEach(idViejo => {
            if (!idsEnviadosEsc.includes(idViejo)) {
                try { record.delete({ type: CUSTOM_RECORD_ESCALAS, id: idViejo }); } catch (e) {}
            }
        });

        // PASO 2: GUARDAR EXCEPCIONES MANUALES
        if (payloadArticulos !== '' && payloadArticulos !== '[]') {
            try {
                const cambiosArt = JSON.parse(payloadArticulos);
                cambiosArt.forEach(row => {
                    let valPorcentaje = (row.porcentaje !== null && row.porcentaje !== undefined && !isNaN(row.porcentaje)) ? parseFloat(row.porcentaje) : null;
                    
                    if (row && row.id) {
                        let recDet = record.load({ type: CUSTOM_RECORD_DETALLE, id: row.id });
                        recDet.setValue({ fieldId: 'custrecord_fut_activo', value: row.activo || false });
                        recDet.setValue({ fieldId: 'custrecord_fut_porcentaje', value: valPorcentaje });
                        recDet.setValue({ fieldId: 'custrecord_fut_descripcion', value: row.descripcion || '' });
                        recDet.save({ ignoreMandatoryFields: true });
                    } else if (row && row.activo) {
                        let recDet = record.create({ type: CUSTOM_RECORD_DETALLE });
                        recDet.setValue({ fieldId: 'custrecord_fut_condicion_individual', value: padreId });
                        recDet.setValue({ fieldId: 'custrecord_fut_articulo', value: row.item });
                        recDet.setValue({ fieldId: 'custrecord_fut_activo', value: true });
                        recDet.setValue({ fieldId: 'custrecord_fut_porcentaje', value: valPorcentaje });
                        recDet.setValue({ fieldId: 'custrecord_fut_descripcion', value: row.descripcion || 'REBATE' });
                        recDet.save({ ignoreMandatoryFields: true });
                    }
                });
            } catch (e) {
                log.error('Error guardando excepciones de artículos', e.message);
            }
        }

        // PASO 3: LANZAR MAP/REDUCE
        if (accionMasiva === 'T' && marcaId !== '' && padreId !== '') {
            try {
                const mrTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: SCRIPT_ID_MR_ESCALAS,
                    params: {
                        custscript1: String(padreId),
                        custscript2: String(marcaId),
                        custscript3: JSON.stringify(escalasNuevasParaMR)
                    }
                });
                mrTask.submit();
            } catch (errMR) {
                log.error('Error al lanzar la tarea Map/Reduce', errMR.message);
            }
        }

        // REDIRECCIÓN PARA MANTENER LA VISTA B Y MOSTRAR ÉXITO
        const scriptObj = runtime.getCurrentScript();
        redirect.toSuitelet({
            scriptId: scriptObj.id,
            deploymentId: scriptObj.deploymentId,
            parameters: {
                padreId: padreId,
                tipo: tipoId,
                marca: marcaId,
                proveedor: proveedorId,
                mode: 'edit',
                exito: 'T'
            }
        });
    }

    return { onRequest };
});