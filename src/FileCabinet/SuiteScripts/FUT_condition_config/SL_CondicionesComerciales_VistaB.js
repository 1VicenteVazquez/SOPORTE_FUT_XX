/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaB.js
 *
 * Ventana flotante (popup): cuadrícula editable (INLINEEDITOR) con los
 * Artículos y el porcentaje de UNA sola Condición (la elegida en Vista A
 * vía el parámetro "tipo": pronto_pago | rebate | crecimiento).
 * Los artículos se agregan directo en la tabla (columna Artículo editable
 * + botón nativo "Add" de NetSuite) — ya no hay selector externo arriba.
 * Al presionar "Guardar y Cerrar", el Client Script empaqueta solo las
 * líneas que cambiaron en un JSON y hace POST a este mismo Suitelet,
 * que lanza el Map/Reduce para aplicar los cambios de forma asíncrona.
 *
 * Rango válido del % (Pronto Pago / Rebate / Crecimiento): 0 a 20,
 * con decimales. La validación en sí vive en el Client Script
 * (CS_CondicionesComerciales_VistaB.js / validateField).
 *
 * NUEVO (filtro Proveedor -> Artículo):
 * El dropdown de "Artículo" del sublist ya NO usa source:'item' (eso
 * traía el catálogo completo, ~9800 artículos). En su lugar, el campo se
 * arma con addSelectOption(), poblado únicamente con los Artículos que:
 *   1. El Proveedor ha comprado/facturado según su historial de
 *      Purchase Order + Bill (obtenerArticulosDelProveedor), y/o
 *   2. Ya están guardados en Condiciones Comerciales para ese
 *      Proveedor+Marca (para no perder datos si algún artículo ya no
 *      aparece en compras recientes).
 * Si el Proveedor no tiene NINGÚN historial ni registros previos (caso
 * poco común, ej. proveedor recién dado de alta), se usa el catálogo
 * completo (source:'item') como fallback, para no dejar el campo
 * inutilizable.
 * El Client Script conserva además una validación de respaldo
 * (validateLine) por si en el futuro se agrega otra vía de edición.
 */
define(['N/ui/serverWidget', 'N/search', 'N/task', 'N/log'], (serverWidget, search, task, log) => {

    const CUSTOM_RECORD_ID = 'customrecord_fut_condiciones_comerciales';
    const MARCA_LIST_ID = 'customlist_nso_list_marca';

    const MR_VISTA_B = {
        scriptId: 'customscript_fut_mr_condcom_actualizar',
        deploymentId: 'customdeploy_fut_mr_condcom_actualizar'
    };

    const FIELD = {
        PROVEEDOR: 'custrecord_cc_proveedor',
        MARCA: 'custrecord_cc_marca',
        ARTICULO: 'custrecord_cc_articulo',
        ACTIVO: 'custrecord_cc_activo',
        PRONTO_PAGO: 'custrecord_cc_pronto_pago',
        REBATE: 'custrecord_cc_rebate',
        CRECIMIENTO: 'custrecord_cc_crecimiento'
    };

    // Mapea el parámetro "tipo" (recibido desde Vista A) a la columna del
    // sublist y su etiqueta visible. Las otras 2 columnas de % se ocultan
    // (siguen viajando en la página, pero no se muestran ni se editan).
    const TIPOS = {
        pronto_pago: { columnaVisible: 'custpage_col_prontopago', label: 'Pronto Pago % (0-20)' },
        rebate: { columnaVisible: 'custpage_col_rebate', label: 'Rebate % (0-20)' },
        crecimiento: { columnaVisible: 'custpage_col_crecimiento', label: 'Crec. Extraordinario % (0-20)' }
    };

    const onRequest = (context) => {
        log.debug({ title: 'SL_VistaB onRequest', details: `Método: ${context.request.method} | Params: ${JSON.stringify(context.request.parameters)}` });

        if (context.request.method === 'GET') {
            renderPopup(context);
        } else {
            handleSave(context);
        }
    };

    function renderPopup(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor;
        const marcaId = params.marca;
        const tipo = params.tipo || 'pronto_pago';
        const tipoCfg = TIPOS[tipo] || TIPOS.pronto_pago;

        log.debug({ title: 'SL_VistaB renderPopup', details: `proveedorId: ${proveedorId} | marcaId: ${marcaId} | tipo: ${tipo}` });

        const form = serverWidget.createForm({ title: `Editar Condición Comercial - ${tipoCfg.label.replace(/ %.*/, '')}` });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaB.js';

        const proveedorField = form.addField({
            id: 'custpage_proveedor',
            type: serverWidget.FieldType.SELECT,
            label: 'Proveedor',
            source: 'vendor'
        });
        proveedorField.defaultValue = proveedorId;
        proveedorField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        const marcaField = form.addField({
            id: 'custpage_marca',
            type: serverWidget.FieldType.SELECT,
            label: 'Marca',
            source: MARCA_LIST_ID
        });
        marcaField.defaultValue = marcaId;
        marcaField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // Guarda qué tipo se está editando para que el Client Script sepa
        // qué columna validar/enviar como "principal".
        const tipoField = form.addField({
            id: 'custpage_tipo',
            type: serverWidget.FieldType.TEXT,
            label: 'Tipo'
        });
        tipoField.defaultValue = tipo;
        tipoField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Campo oculto donde el Client Script deposita el JSON de cambios
        const payloadField = form.addField({
            id: 'custpage_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Payload'
        });
        payloadField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        form.addSubmitButton('Guardar y Cerrar');

        const sublist = form.addSublist({
            id: 'custpage_sublist',
            type: serverWidget.SublistType.INLINEEDITOR,
            label: 'Artículos'
        });

        const idCol = sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        idCol.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // ---- NUEVO: Artículo -> dropdown restringido al catálogo del Proveedor ----
        // 1. Se buscan los artículos que el Proveedor ha comprado/facturado
        //    (Purchase Order + Bill).
        // 2. Se cargan también los registros ya guardados de Condiciones
        //    Comerciales para este Proveedor+Marca (necesitamos saberlo ANTES
        //    de armar el dropdown, para no perder artículos ya guardados que
        //    por algún motivo ya no aparezcan en compras recientes).
        // 3. Con esas dos listas se arma UN SOLO conjunto de opciones y se
        //    agregan al campo con addSelectOption -> el dropdown nativo de
        //    NetSuite YA NO muestra el catálogo completo, solo estas opciones.
        const registros = buscarCondicionesComerciales(proveedorId, marcaId);
        const opcionesArticulo = obtenerOpcionesArticuloParaProveedor(proveedorId, registros);

        log.audit({
            title: 'SL_VistaB - Opciones de Artículo generadas para el dropdown',
            details: `proveedorId: ${proveedorId} | total opciones: ${opcionesArticulo.length}`
        });

        const itemField = sublist.addField({ id: 'custpage_col_item', type: serverWidget.FieldType.SELECT, label: 'Artículo' });

        if (opcionesArticulo.length > 0) {
            itemField.addSelectOption({ value: '', text: '' });
            opcionesArticulo.forEach((op) => {
                itemField.addSelectOption({ value: op.id, text: op.text });
            });
        } else {
            // Proveedor sin ningún historial de compra ni registros previos:
            // no hay forma de "adivinar" su catálogo, así que se deja el
            // picker nativo completo como fallback (mejor que dejar el
            // campo inutilizable). Se loguea para que quede visible.
            log.audit({
                title: 'SL_VistaB - Proveedor sin artículos conocidos, se usa catálogo completo como fallback',
                details: `proveedorId: ${proveedorId}`
            });
            itemField.source = 'item';
        }
        // ---------------------------------------------------------------------

        // Se sigue mandando la lista de IDs permitidos como respaldo para el
        // Client Script (por si en el futuro se agrega otra vía de edición).
        const articulosPermitidosField = form.addField({
            id: 'custpage_articulos_permitidos',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Articulos Permitidos'
        });
        articulosPermitidosField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        articulosPermitidosField.defaultValue = JSON.stringify(opcionesArticulo.map((op) => op.id));

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' });

        // Las 3 columnas de % siempre se agregan (para no perder los otros
        // 2 valores al guardar), pero solo la del "tipo" actual queda
        // visible; las otras 2 se ocultan.
        const colProntoPago = sublist.addField({ id: 'custpage_col_prontopago', type: serverWidget.FieldType.FLOAT, label: 'Pronto Pago % (0-20)' });
        const colRebate = sublist.addField({ id: 'custpage_col_rebate', type: serverWidget.FieldType.FLOAT, label: 'Rebate % (0-20)' });
        const colCrecimiento = sublist.addField({ id: 'custpage_col_crecimiento', type: serverWidget.FieldType.FLOAT, label: 'Crec. Extraordinario % (0-20)' });

        const COLUMNAS_PERCENT = {
            custpage_col_prontopago: colProntoPago,
            custpage_col_rebate: colRebate,
            custpage_col_crecimiento: colCrecimiento
        };

        Object.keys(COLUMNAS_PERCENT).forEach((colId) => {
            if (colId !== tipoCfg.columnaVisible) {
                COLUMNAS_PERCENT[colId].updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            }
        });

        log.debug({ title: 'SL_VistaB registros encontrados', details: registros.length });

        registros.forEach((r, i) => {
            sublist.setSublistValue({ id: 'custpage_col_id', line: i, value: r.id });
            sublist.setSublistValue({ id: 'custpage_col_item', line: i, value: r.itemId });
            sublist.setSublistValue({ id: 'custpage_col_activo', line: i, value: r.activo ? 'T' : 'F' });
            sublist.setSublistValue({ id: 'custpage_col_prontopago', line: i, value: r.prontoPago });
            sublist.setSublistValue({ id: 'custpage_col_rebate', line: i, value: r.rebate });
            sublist.setSublistValue({ id: 'custpage_col_crecimiento', line: i, value: r.crecimiento });
        });

        context.response.writePage(form);
    }

    /**
     * NUEVO: devuelve un array de { id, text } de Artículos que el
     * Proveedor ha comprado/facturado históricamente, según Purchase
     * Order + Bill. "text" es el nombre/código del artículo, para poder
     * armar las opciones del dropdown con addSelectOption.
     */
    function obtenerArticulosDelProveedor(proveedorId) {
        const items = [];

        if (!proveedorId) {
            return items;
        }

        try {
            const s = search.create({
                type: search.Type.TRANSACTION,
                filters: [
                    ['type', 'anyof', ['PurchOrd', 'VendBill']],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['item', 'noneof', '@NONE@'],
                    'AND',
                    ['entity', 'anyof', proveedorId]
                ],
                columns: [
                    search.createColumn({ name: 'item', summary: 'GROUP' })
                ]
            });

            s.run().each((r) => {
                const itemId = r.getValue({ name: 'item', summary: 'GROUP' });
                const itemText = r.getText({ name: 'item', summary: 'GROUP' });
                if (itemId) items.push({ id: String(itemId), text: itemText || String(itemId) });
                return true;
            });

            log.debug({
                title: 'SL_VistaB obtenerArticulosDelProveedor - resultado',
                details: `proveedorId: ${proveedorId} | items encontrados: ${items.length}`
            });
        } catch (e) {
            log.error({
                title: 'SL_VistaB - Error en obtenerArticulosDelProveedor',
                details: `proveedorId: ${proveedorId} | ${e.message}`
            });
        }

        return items;
    }

    /**
     * NUEVO: combina los Artículos del historial de PO/Bill con los
     * Artículos que ya están guardados en Condiciones Comerciales para
     * este Proveedor+Marca (por si alguno ya no aparece en compras
     * recientes, para no "perder" datos existentes del dropdown).
     * Devuelve un array de { id, text } sin duplicados.
     */
    function obtenerOpcionesArticuloParaProveedor(proveedorId, registrosExistentes) {
        const delHistorial = obtenerArticulosDelProveedor(proveedorId);

        const idsYaIncluidos = {};
        const opciones = [];

        delHistorial.forEach((it) => {
            if (!idsYaIncluidos[it.id]) {
                idsYaIncluidos[it.id] = true;
                opciones.push(it);
            }
        });

        (registrosExistentes || []).forEach((r) => {
            const itemId = String(r.itemId);
            if (itemId && !idsYaIncluidos[itemId]) {
                idsYaIncluidos[itemId] = true;
                opciones.push({ id: itemId, text: obtenerNombreArticulo(itemId) });
                log.audit({
                    title: 'SL_VistaB - Artículo agregado al dropdown desde registro existente (no está en historial de PO/Bill)',
                    details: `itemId: ${itemId}`
                });
            }
        });

        return opciones;
    }

    function obtenerNombreArticulo(itemId) {
        try {
            const fields = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: ['itemid'] });
            return fields.itemid || String(itemId);
        } catch (e) {
            log.error({ title: 'SL_VistaB - Error en obtenerNombreArticulo', details: `itemId: ${itemId} | ${e.message}` });
            return String(itemId);
        }
    }

    function buscarCondicionesComerciales(proveedorId, marcaId) {
        const out = [];

        try {
            const s = search.create({
                type: CUSTOM_RECORD_ID,
                filters: [
                    [FIELD.PROVEEDOR, 'anyof', proveedorId],
                    'AND',
                    [FIELD.MARCA, 'anyof', marcaId]
                ],
                columns: [FIELD.ARTICULO, FIELD.ACTIVO, FIELD.PRONTO_PAGO, FIELD.REBATE, FIELD.CRECIMIENTO]
            });

            s.run().each((r) => {
                out.push({
                    id: r.id,
                    itemId: r.getValue(FIELD.ARTICULO),
                    activo: r.getValue(FIELD.ACTIVO) === true || r.getValue(FIELD.ACTIVO) === 'T',
                    prontoPago: r.getValue(FIELD.PRONTO_PAGO),
                    rebate: r.getValue(FIELD.REBATE),
                    crecimiento: r.getValue(FIELD.CRECIMIENTO)
                });
                return true;
            });
        } catch (e) {
            log.error({ title: 'SL_VistaB - Error en buscarCondicionesComerciales', details: e.message });
        }

        return out;
    }

    function handleSave(context) {
        const params = context.request.parameters;
        const proveedorId = params.custpage_proveedor;
        const marcaId = params.custpage_marca;
        const payloadRaw = params.custpage_payload;

        log.debug({ title: 'SL_VistaB handleSave', details: `proveedorId: ${proveedorId} | marcaId: ${marcaId} | payload length: ${payloadRaw ? payloadRaw.length : 0}` });

        let cambios = [];
        try {
            cambios = payloadRaw ? JSON.parse(payloadRaw) : [];
        } catch (e) {
            log.error({ title: 'SL_VistaB - Error parseando payload', details: e.message });
        }

        log.debug({ title: 'SL_VistaB handleSave - cambios a procesar', details: cambios.length });

        if (cambios.length > 0) {
            try {
                const mrTask = task.create({ taskType: task.TaskType.MAP_REDUCE });
                mrTask.scriptId = MR_VISTA_B.scriptId;
                mrTask.deploymentId = MR_VISTA_B.deploymentId;
                mrTask.params = {
                    custscript_mr_cc_proveedor: proveedorId,
                    custscript_mr_cc_marca: marcaId,
                    custscript_mr_cc_cambios: JSON.stringify(cambios)
                };
                const taskId = mrTask.submit();
                log.debug({ title: 'SL_VistaB - Map/Reduce lanzado', details: `taskId: ${taskId}` });
            } catch (e) {
                log.error({ title: 'SL_VistaB - Error lanzando Map/Reduce', details: e.message });
            }
        }

        // Página mínima que cierra la ventana flotante y refresca la Vista A
        context.response.write(
            '<html><body>' +
            '<script>' +
            'if (window.opener && !window.opener.closed) { window.opener.location.reload(); }' +
            'window.close();' +
            '</script>' +
            'Guardado. Puede cerrar esta ventana si no se cierra sola.' +
            '</body></html>'
        );
    }

    return { onRequest };
});