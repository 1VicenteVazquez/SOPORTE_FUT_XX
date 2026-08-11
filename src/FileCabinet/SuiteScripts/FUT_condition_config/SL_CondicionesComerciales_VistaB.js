/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaB.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/task', 'N/log'], (serverWidget, search, task, log) => {

    const PAGE_SIZE = 15;

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') procesarGuardado(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        
        const isEdit = (params.mode === 'edit');
        const titulo = isEdit ? 'Asignación de Condiciones (Edición)' : 'Asignación de Condiciones (Consulta)';
        
        const form = serverWidget.createForm({ title: titulo, hideNavBar: true });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaB.js';

        // Variables Ocultas
        form.addField({ id: 'custpage_padre_id', type: serverWidget.FieldType.TEXT, label: 'Padre' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.padreId;
        form.addField({ id: 'custpage_tipo_id', type: serverWidget.FieldType.TEXT, label: 'Tipo' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.tipo;
        form.addField({ id: 'custpage_marca_id', type: serverWidget.FieldType.TEXT, label: 'Marca' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.marca;
        form.addField({ id: 'custpage_proveedor_id', type: serverWidget.FieldType.TEXT, label: 'Prov' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = params.proveedor;
        form.addField({ id: 'custpage_payload', type: serverWidget.FieldType.LONGTEXT, label: 'Payload' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        // --- SECCIÓN DE FILTROS ---
        form.addField({ id: 'custpage_filtro', type: serverWidget.FieldType.TEXT, label: 'Buscar por Código / Nombre' }).defaultValue = params.filtro || '';
        form.addField({ id: 'custpage_filtro_rin', type: serverWidget.FieldType.TEXT, label: 'Buscar por Tamaño de Rin' }).defaultValue = params.filtroRin || '';
        
        const htmlPaginacion = form.addField({ id: 'custpage_html_paginacion', type: serverWidget.FieldType.INLINEHTML, label: ' ' });

        if (isEdit) {
            form.addSubmitButton({ label: 'Guardar Cambios' });
            form.addButton({ id: 'btn_cerrar', label: 'Cancelar', functionName: 'cerrarPopup' });
        } else {
            form.addButton({ id: 'btn_cerrar', label: 'Cerrar Ventana', functionName: 'cerrarPopup' });
        }

        const sublist = form.addSublist({ id: 'custpage_sublist', type: serverWidget.SublistType.LIST, label: 'Artículos' });
        
        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'Reg ID' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        
        const displayModo = isEdit ? serverWidget.FieldDisplayType.ENTRY : serverWidget.FieldDisplayType.INLINE;
        
        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' }).updateDisplayType({ displayType: displayModo });
        sublist.addField({ id: 'custpage_col_item', type: serverWidget.FieldType.SELECT, label: 'Artículo', source: 'item' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        sublist.addField({ id: 'custpage_col_rin', type: serverWidget.FieldType.TEXT, label: 'Tamaño de Rin' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        sublist.addField({ id: 'custpage_col_descripcion', type: serverWidget.FieldType.TEXT, label: 'Descripción Porcentaje' }).updateDisplayType({ displayType: displayModo });

        // 1. CAMBIO: SELECT con puntos decimales hasta el 10%
        const fldPorcentaje = sublist.addField({ id: 'custpage_col_porcentaje', type: serverWidget.FieldType.SELECT, label: 'Porcentaje de Descuento' });
        fldPorcentaje.updateDisplayType({ displayType: displayModo });
        fldPorcentaje.addSelectOption({ value: '', text: '- N/A -' });
        
        // Bucle para generar del 0.1 al 10.0
        for (let i = 1; i <= 100; i++) {
            let val = i / 10;
            // value='1.5', text='1.5%'
            fldPorcentaje.addSelectOption({ value: val.toString(), text: val.toFixed(1) + '%' });
        }

        if (params.marca && params.padreId) {
            cargarArticulos(sublist, params.marca, params.padreId, params.filtro || '', params.filtroRin || '', parseInt(params.page) || 0, htmlPaginacion);
        }

        context.response.writePage(form);
    }

    function cargarArticulos(sublist, marcaId, padreId, filtroTexto, filtroRinTexto, pageIndex, htmlPaginacion) {
        const registrosHijo = {};
        
        log.debug('VISTA B - Buscando Registros', `Padre ID: ${padreId}`);

        search.create({
            type: 'customrecord_fut_condicion_detalle',
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
        
        // 2. CORRECCIÓN: Filtro con Formulatext para evitar cruces con IDs Internos
        if (filtroRinTexto) {
            filtrosItem.push('AND', ['formulatext: {custitem_diametro_rin}', 'contains', filtroRinTexto]); 
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
                
                const tamanoRin = res.getText('custitem_diametro_rin') || res.getValue('custitem_diametro_rin') || '';
                const txtPorDefecto = "REBATE"; 
                
                sublist.setSublistValue({ id: 'custpage_col_item', line: line, value: res.id });
                
                if (tamanoRin) {
                    sublist.setSublistValue({ id: 'custpage_col_rin', line: line, value: tamanoRin });
                }
                
                if (dataHijo) {
                    sublist.setSublistValue({ id: 'custpage_col_id', line: line, value: dataHijo.id });
                    sublist.setSublistValue({ id: 'custpage_col_activo', line: line, value: dataHijo.activo ? 'T' : 'F' });
                    
                    let descFinal = (dataHijo.desc !== null && dataHijo.desc !== undefined) ? dataHijo.desc : txtPorDefecto;
                    if (descFinal !== '') {
                        sublist.setSublistValue({ id: 'custpage_col_descripcion', line: line, value: descFinal });
                    }
                    
                    // 3. CAMBIO: Utilizamos parseFloat para empatar valores como "1.5" al SELECT sin importar cómo vengan de la BD
                    if (dataHijo.pct !== null && dataHijo.pct !== '') {
                        let valorParaSelect = parseFloat(dataHijo.pct).toString();
                        if (!isNaN(valorParaSelect)) {
                            sublist.setSublistValue({ id: 'custpage_col_porcentaje', line: line, value: valorParaSelect });
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
        const payload = req.parameters.custpage_payload;
        
        if (payload && payload !== '[]') {
            task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_fut_mr_condcom_actualizar',
                deploymentId: 'customdeploy_fut_mr_condcom_actualizar',
                params: {
                    'custscript_mr_cc_padre_id': req.parameters.custpage_padre_id,
                    'custscript_mr_cc_tipo_id': req.parameters.custpage_tipo_id,
                    'custscript_mr_cc_cambios': payload
                }
            }).submit();
        }

        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:50px;">
                <h2 style="color:#005587;">Procesando cambios en segundo plano...</h2>
                <script>setTimeout(function(){ window.close(); }, 2000);</script>
            </body></html>
        `);
    }

    return { onRequest };
});