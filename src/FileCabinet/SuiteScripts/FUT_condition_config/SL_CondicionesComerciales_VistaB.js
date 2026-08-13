/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaB.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/log'], (serverWidget, search, record, log) => {

    const PAGE_SIZE = 25; 
    const CUSTOM_RECORD_ESCALAS = 'customrecord_fut_escalas_meta';
    const CUSTOM_RECORD_DETALLE = 'customrecord_fut_condicion_detalle';

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

        // --- CAMPOS OCULTOS ---
        form.addField({ id: 'custpage_padre_id', type: serverWidget.FieldType.TEXT, label: 'Padre' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = padreId;
        form.addField({ id: 'custpage_tipo_id', type: serverWidget.FieldType.TEXT, label: 'Tipo' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.tipo;
        form.addField({ id: 'custpage_marca_id', type: serverWidget.FieldType.TEXT, label: 'Marca' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.marca;
        form.addField({ id: 'custpage_proveedor_id', type: serverWidget.FieldType.TEXT, label: 'Prov' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.proveedor;
        form.addField({ id: 'custpage_payload', type: serverWidget.FieldType.LONGTEXT, label: 'Payload' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        // Campo oculto para saber si se invocó la acción masiva desde el botón personalizado
        form.addField({ id: 'custpage_accion_masiva', type: serverWidget.FieldType.TEXT, label: 'Acción Masiva' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = 'F';

        // --- CREACIÓN DE PESTAÑAS (TABS) ---
        form.addTab({ id: 'custpage_tab_articulos', label: '1. Vista General de Artículos (Excepciones)' });
        form.addTab({ id: 'custpage_tab_escalas', label: '2. Escalas por Segmento de Rin (Maestro)' });

        // Botones organizados y limpios sin duplicarse
        if (isEdit) {
            form.addSubmitButton({ label: 'Guardar Cambios' });
            
            // Botón personalizado limpio vinculado a la Pestaña 2
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

        // ==========================================
        // PESTAÑA 1: ARTÍCULOS
        // ==========================================
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

        // ==========================================
        // PESTAÑA 2: ESCALAS POR SEGMENTO
        // ==========================================
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

                if (min) sublistEscalas.setSublistValue({ id: 'custpage_col_esc_min', line: escLine, value: min });
                if (max) sublistEscalas.setSublistValue({ id: 'custpage_col_esc_max', line: escLine, value: max });
                
                if (meta !== null && meta !== '') {
                    let numMetaPct = parseFloat(meta);
                    let valMetaSel = numMetaPct <= 1 ? (numMetaPct * 100).toString() : numMetaPct.toString();
                    sublistEscalas.setSublistValue({ id: 'custpage_col_esc_meta', line: escLine, value: valMetaSel });
                }

                if (cuota) sublistEscalas.setSublistValue({ id: 'custpage_col_esc_cuota', line: escLine, value: cuota });
                
                if (desc !== null && desc !== '') {
                    let numDescPct = parseFloat(desc);
                    let valDescSel = numDescPct <= 1 ? (numDescPct * 100).toString() : numDescPct.toString();
                    sublistEscalas.setSublistValue({ id: 'custpage_col_esc_desc', line: escLine, value: valDescSel });
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
            const idArticuloStr = String(res.getValue('custrecord_fut_articulo'));
            const valorActivo = res.getValue('custrecord_fut_activo');
            
            if (idArticuloStr) {
                registrosHijo[idArticuloStr] = {
                    id: String(res.id),
                    activo: (valorActivo === 'T' || valorActivo === true),
                    pct: res.getValue('custrecord_fut_porcentaje'),
                    desc: res.getValue('custrecord_fut_descripcion')
                };
            }
            return true;
        });

        let filtrosItem = [['custitem_nso_marca', 'anyof', marcaId], 'AND', ['isinactive', 'is', 'F']];
        if (filtroTexto) filtrosItem.push('AND', [['itemid', 'contains', filtroTexto], 'OR', ['displayname', 'contains', filtroTexto]]);
        if (filtroRinTexto) filtrosItem.push('AND', ['formulatext: {custitem_diametro_rin}', 'contains', filtroRinTexto]); 

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
                if (tamanoRinRaw) sublist.setSublistValue({ id: 'custpage_col_rin', line: line, value: tamanoRinRaw });
                
                if (dataHijo) {
                    sublist.setSublistValue({ id: 'custpage_col_id', line: line, value: dataHijo.id });
                    sublist.setSublistValue({ id: 'custpage_col_activo', line: line, value: dataHijo.activo ? 'T' : 'F' });
                    
                    let descFinal = (dataHijo.desc !== null && dataHijo.desc !== undefined) ? dataHijo.desc : txtPorDefecto;
                    if (descFinal !== '') sublist.setSublistValue({ id: 'custpage_col_descripcion', line: line, value: descFinal });
                    
                    if (dataHijo.pct !== null && dataHijo.pct !== '') {
                        let numPct = parseFloat(dataHijo.pct);
                        let valSel = numPct <= 1 ? (numPct * 100).toString() : numPct.toString();
                        sublist.setSublistValue({ id: 'custpage_col_porcentaje', line: line, value: valSel });
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
        const padreId = req.parameters.custpage_padre_id;
        const marcaId = req.parameters.custpage_marca_id;
        const payloadArticulos = req.parameters.custpage_payload;
        const accionMasiva = req.parameters.custpage_accion_masiva;

        // 1. GUARDAR EXCEPCIONES MANUALES DE LA PESTAÑA 1
        if (payloadArticulos && payloadArticulos !== '[]' && payloadArticulos !== null && payloadArticulos !== undefined) {
            try {
                const cambiosArt = JSON.parse(payloadArticulos);
                cambiosArt.forEach(row => {
                    if (row && row.id) {
                        let recDet = record.load({ type: CUSTOM_RECORD_DETALLE, id: row.id });
                        recDet.setValue({ fieldId: 'custrecord_fut_activo', value: row.activo || false });
                        recDet.setValue({ fieldId: 'custrecord_fut_porcentaje', value: row.porcentaje ? row.porcentaje / 100 : '' });
                        recDet.setValue({ fieldId: 'custrecord_fut_descripcion', value: row.descripcion || '' });
                        recDet.save({ ignoreMandatoryFields: true });
                    } else if (row && row.activo) {
                        let recDet = record.create({ type: CUSTOM_RECORD_DETALLE });
                        recDet.setValue({ fieldId: 'custrecord_fut_condicion_individual', value: padreId });
                        recDet.setValue({ fieldId: 'custrecord_fut_articulo', value: row.item });
                        recDet.setValue({ fieldId: 'custrecord_fut_activo', value: true });
                        recDet.setValue({ fieldId: 'custrecord_fut_porcentaje', value: row.porcentaje ? row.porcentaje / 100 : '' });
                        recDet.setValue({ fieldId: 'custrecord_fut_descripcion', value: row.descripcion || 'REBATE' });
                        recDet.save({ ignoreMandatoryFields: true });
                    }
                });
            } catch (e) {
                log.error('Error guardando excepciones de artículos', e ? e.message : 'Error desconocido');
            }
        }

        // 2. GUARDAR Y ACTUALIZAR ESCALAS DE LA PESTAÑA 2
        const lineCountEsc = req.getLineCount({ group: 'custpage_sublist_escalas' }) || 0;
        const idsExistentesEsc = [];
        const escalasNuevas = [];
        
        if (padreId) {
            search.create({
                type: CUSTOM_RECORD_ESCALAS,
                filters: [['custrecord_fut_em_padre', 'anyof', padreId]],
                columns: ['internalid']
            }).run().each(res => {
                if (res && res.id) idsExistentesEsc.push(res.id);
                return true;
            });
        }

        const idsEnviadosEsc = [];
        for (let i = 0; i < lineCountEsc; i++) {
            const idEsc = req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_id', line: i });
            const rinMin = req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_min', line: i });
            const rinMax = req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_max', line: i });
            const metaSelect = req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_meta', line: i });
            const cuota = req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_cuota', line: i });
            const descSelect = req.getSublistValue({ group: 'custpage_sublist_escalas', name: 'custpage_col_esc_desc', line: i });

            if (!rinMin && !rinMax && !descSelect) continue;

            if (idEsc) idsEnviadosEsc.push(idEsc);

            let metaValor = (metaSelect !== null && metaSelect !== undefined && metaSelect !== '') ? parseFloat(metaSelect) / 100 : '';
            let descValor = (descSelect !== null && descSelect !== undefined && descSelect !== '') ? parseFloat(descSelect) / 100 : '';

            let recEsc = idEsc ? record.load({ type: CUSTOM_RECORD_ESCALAS, id: idEsc }) : record.create({ type: CUSTOM_RECORD_ESCALAS });
            recEsc.setValue({ fieldId: 'custrecord_fut_em_padre', value: padreId || '' });
            recEsc.setValue({ fieldId: 'custrecord_fut_em_rin_min', value: rinMin || '' });
            recEsc.setValue({ fieldId: 'custrecord_fut_em_rin_max', value: rinMax || '' });
            recEsc.setValue({ fieldId: 'custrecord_fut_em_meta_pct', value: metaValor });
            recEsc.setValue({ fieldId: 'custrecord_fut_em_cuota', value: cuota || '' });
            recEsc.setValue({ fieldId: 'custrecord_fut_em_descuento_pct', value: descValor });
            recEsc.save({ ignoreMandatoryFields: true });

            if (rinMin !== null && rinMin !== undefined && rinMin !== '' && 
                rinMax !== null && rinMax !== undefined && rinMax !== '' && 
                descSelect !== null && descSelect !== undefined && descSelect !== '') {
                escalasNuevas.push({
                    min: parseInt(rinMin, 10),
                    max: parseInt(rinMax, 10),
                    descuentoNum: parseFloat(descSelect)
                });
            }
        }

        // Eliminar escalas borradas
        idsExistentesEsc.forEach(idViejo => {
            if (!idsEnviadosEsc.includes(idViejo)) {
                try { record.delete({ type: CUSTOM_RECORD_ESCALAS, id: idViejo }); } catch (e) {}
            }
        });

        // 3. PROPAGACIÓN AUTOMÁTICA (Solo si se presionó el botón personalizado de aplicar escalas)
        if (accionMasiva === 'T' && escalasNuevas.length > 0 && marcaId && padreId) {
            try {
                const mapaDetallesExistentes = {};
                search.create({
                    type: CUSTOM_RECORD_DETALLE,
                    filters: [['custrecord_fut_condicion_individual', 'anyof', padreId]],
                    columns: ['internalid', 'custrecord_fut_articulo']
                }).run().each(res => {
                    if (res && res.getValue('custrecord_fut_articulo')) {
                        mapaDetallesExistentes[String(res.getValue('custrecord_fut_articulo'))] = res.id;
                    }
                    return true;
                });

                search.create({
                    type: search.Type.ITEM,
                    filters: [['custitem_nso_marca', 'anyof', marcaId], 'AND', ['isinactive', 'is', 'F'], 'AND', ['custitem_diametro_rin', 'isnotempty', '']],
                    columns: ['internalid', 'custitem_diametro_rin']
                }).run().each(res => {
                    if (!res) return true;
                    const itemId = res.id;
                    const rinTexto = res.getText('custitem_diametro_rin') || res.getValue('custitem_diametro_rin');

                    if (rinTexto !== null && rinTexto !== undefined && rinTexto !== '') {
                        const rinArticulo = parseFloat(rinTexto);

                        if (!isNaN(rinArticulo)) {
                            let escalaEncontrada = escalasNuevas.find(esc => rinArticulo >= esc.min && rinArticulo <= esc.max);

                            if (escalaEncontrada) {
                                let detalleId = mapaDetallesExistentes[String(itemId)];

                                if (detalleId) {
                                    let recDetalle = record.load({ type: CUSTOM_RECORD_DETALLE, id: detalleId });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_activo', value: true });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_porcentaje', value: escalaEncontrada.descuentoNum / 100 });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_descripcion', value: 'REBATE' });
                                    recDetalle.save({ ignoreMandatoryFields: true });
                                } else {
                                    let recDetalle = record.create({ type: CUSTOM_RECORD_DETALLE });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_condicion_individual', value: padreId });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_articulo', value: itemId });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_activo', value: true });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_porcentaje', value: escalaEncontrada.descuentoNum / 100 });
                                    recDetalle.setValue({ fieldId: 'custrecord_fut_descripcion', value: 'REBATE' });
                                    recDetalle.save({ ignoreMandatoryFields: true });
                                }
                            }
                        }
                    }
                    return true;
                });
            } catch (err) {
                log.error('Error en propagación automática de escalas', err ? err.message : 'Error desconocido');
            }
        }

        const mensajeExito = (accionMasiva === 'T') 
            ? '¡Escalas guardadas y aplicadas a los artículos exitosamente!' 
            : '¡Cambios guardados con éxito!';

        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:50px;">
                <h2 style="color:#005587;">${mensajeExito}</h2>
                <script>setTimeout(function(){ window.close(); }, 1500);</script>
            </body></html>
        `);
    }

    return { onRequest };
});