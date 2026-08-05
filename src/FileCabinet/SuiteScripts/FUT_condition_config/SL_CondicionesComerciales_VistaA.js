/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaA.js
 *
 * Pantalla principal: filtros Proveedor / Marca + tabla con las 3
 * Condiciones Comerciales fijas (Pronto Pago, Rebate, Crecimiento
 * Extraordinario). Cada fila muestra:
 *   ACTIVO (checkbox de solo lectura, resumen) | CONDICIÓN COMERCIAL | VER
 *
 * El botón VER de cada fila abre SL_CondicionesComerciales_VistaB.js en
 * una ventana flotante, filtrado a esa Condición específica (parámetro
 * "tipo": pronto_pago | rebate | crecimiento).
 *
 * NOTA: el checkbox ACTIVO de esta pantalla es un resumen de solo lectura:
 * se marca si existe al menos un Artículo, para ese Proveedor+Marca, con
 * custrecord_cc_activo = true Y ese porcentaje > 0. La edición real
 * (activar/desactivar por Artículo) ocurre dentro del popup (Vista B).
 * Si el negocio requiere que este checkbox sea editable a nivel Condición,
 * avísame y lo ajustamos.
 */
define(['N/ui/serverWidget', 'N/search', 'N/log'], (serverWidget, search, log) => {

    const CUSTOM_RECORD_ID = 'customrecord_fut_condiciones_comerciales';
    const MARCA_LIST_ID = 'customlist_nso_list_marca';

    const FIELD = {
        PROVEEDOR: 'custrecord_cc_proveedor',
        MARCA: 'custrecord_cc_marca',
        ARTICULO: 'custrecord_cc_articulo',
        ACTIVO: 'custrecord_cc_activo',
        PRONTO_PAGO: 'custrecord_cc_pronto_pago',
        REBATE: 'custrecord_cc_rebate',
        CRECIMIENTO: 'custrecord_cc_crecimiento'
    };

    // Las 3 Condiciones Comerciales fijas que existen hoy en el negocio.
    const TIPOS_CONDICION = [
        { tipo: 'pronto_pago', label: 'Pronto Pago', campoPercent: FIELD.PRONTO_PAGO },
        { tipo: 'rebate', label: 'Rebate', campoPercent: FIELD.REBATE },
        { tipo: 'crecimiento', label: 'Crecimiento Extraordinario', campoPercent: FIELD.CRECIMIENTO }
    ];

    const onRequest = (context) => {
        log.debug({ title: 'SL_VistaA onRequest', details: `Método: ${context.request.method} | Params: ${JSON.stringify(context.request.parameters)}` });

        if (context.request.method === 'GET') {
            renderForm(context);
        }
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor || '';
        const marcaId = params.marca || '';

        log.debug({ title: 'SL_VistaA renderForm', details: `proveedorId: ${proveedorId} | marcaId: ${marcaId}` });

        const form = serverWidget.createForm({ title: 'Condiciones Comerciales por Proveedor' });
        form.clientScriptModulePath = './CS_CondicionesComerciales_VistaA.js';

        const proveedorField = form.addField({
            id: 'custpage_proveedor',
            type: serverWidget.FieldType.SELECT,
            label: 'Proveedor',
            source: 'vendor'
        });
        proveedorField.isMandatory = true;
        if (proveedorId) proveedorField.defaultValue = proveedorId;

        const marcaField = form.addField({
            id: 'custpage_marca',
            type: serverWidget.FieldType.SELECT,
            label: 'Marca',
            source: MARCA_LIST_ID
        });
        marcaField.isMandatory = true;
        if (marcaId) marcaField.defaultValue = marcaId;

        form.addButton({
            id: 'custpage_btn_buscar',
            label: 'Buscar',
            functionName: 'buscarCondiciones'
        });

        const sublist = form.addSublist({
            id: 'custpage_sublist',
            type: serverWidget.SublistType.LIST,
            label: 'Condiciones Comerciales'
        });

        sublist.addField({ id: 'custpage_col_activo', type: serverWidget.FieldType.CHECKBOX, label: 'Activo' });
        sublist.addField({ id: 'custpage_col_condicion', type: serverWidget.FieldType.TEXT, label: 'Condición Comercial' });

        // Columna de acción con HTML crudo: NetSuite no permite botones
        // individuales por fila en un sublist tipo LIST, así que se arma
        // un link con estilo de botón que llama a una función global del
        // Client Script (ver abrirEdicionTipo en CS_CondicionesComerciales_VistaA.js).
        const accionCol = sublist.addField({ id: 'custpage_col_accion', type: serverWidget.FieldType.TEXT, label: 'Acción' });
        accionCol.updateDisplayType({ displayType: serverWidget.FieldDisplayType.NORMAL });

        if (proveedorId && marcaId) {
            TIPOS_CONDICION.forEach((cfg, i) => {
                const activo = existeCondicionActiva(proveedorId, marcaId, cfg.campoPercent);

                sublist.setSublistValue({ id: 'custpage_col_activo', line: i, value: activo ? 'T' : 'F' });
                sublist.setSublistValue({ id: 'custpage_col_condicion', line: i, value: cfg.label });
                sublist.setSublistValue({
                    id: 'custpage_col_accion',
                    line: i,
                    value: `<a href="javascript:void(0);" onclick="abrirEdicionTipo('${cfg.tipo}')" style="display:inline-block;background:#607799;color:#fff;padding:3px 14px;border-radius:3px;text-decoration:none;font-weight:bold;">VER</a>`
                });
            });

            log.debug({ title: 'SL_VistaA filas renderizadas', details: TIPOS_CONDICION.length });
        }

        context.response.writePage(form);
    }

    /**
     * true si existe al menos un Artículo (para ese Proveedor+Marca) con
     * custrecord_cc_activo = true y el porcentaje de ese tipo > 0.
     */
    function existeCondicionActiva(proveedorId, marcaId, campoPercent) {
        try {
            const s = search.create({
                type: CUSTOM_RECORD_ID,
                filters: [
                    [FIELD.PROVEEDOR, 'anyof', proveedorId],
                    'AND',
                    [FIELD.MARCA, 'anyof', marcaId],
                    'AND',
                    [FIELD.ACTIVO, 'is', 'T'],
                    'AND',
                    [campoPercent, 'greaterthan', 0]
                ],
                columns: ['internalid']
            });

            const resultSet = s.run().getRange({ start: 0, end: 1 });
            return resultSet && resultSet.length > 0;
        } catch (e) {
            log.error({ title: 'SL_VistaA - Error en existeCondicionActiva', details: `campo: ${campoPercent} | ${e.message}` });
            return false;
        }
    }

    return { onRequest };
});