/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaA.js
 */
define(['N/ui/serverWidget', 'N/search', 'N/log'], (serverWidget, search, log) => {

    const CUSTOM_RECORD_ID = 'customrecord_fut_condiciones_comerciales';

    const FIELD = {
        PROVEEDOR: 'custrecord_cc_proveedor',
        MARCA: 'custrecord_cc_marca',
        ARTICULO: 'custrecord_cc_articulo',
        ACTIVO: 'custrecord_cc_activo',
        PRONTO_PAGO: 'custrecord_cc_pronto_pago',
        REBATE: 'custrecord_cc_rebate',
        CRECIMIENTO: 'custrecord_cc_crecimiento'
    };

    const TIPOS_CONDICION = [
        { tipo: 'pronto_pago', label: 'Pronto Pago', campoPercent: FIELD.PRONTO_PAGO },
        { tipo: 'rebate', label: 'Rebate', campoPercent: FIELD.REBATE },
        { tipo: 'crecimiento', label: 'Crecimiento Extraordinario', campoPercent: FIELD.CRECIMIENTO }
    ];

    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            renderForm(context);
        }
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const proveedorId = params.proveedor || '';
        let marcaId = params.marca || '';

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

        // ACTUALIZADO: El campo de marca se crea SIN "source" para que nazca vacío
        const marcaField = form.addField({
            id: 'custpage_marca',
            type: serverWidget.FieldType.SELECT,
            label: 'Marca'
        });
        marcaField.isMandatory = true;
        marcaField.addSelectOption({ value: '', text: '' });

        // Si ya seleccionaron un proveedor, buscamos sus marcas exclusivas
        if (proveedorId) {
            try {
                const vendorFields = search.lookupFields({
                    type: search.Type.VENDOR,
                    id: proveedorId,
                    columns: ['custentity_marca']
                });

                let marcasProveedor = vendorFields.custentity_marca;
                
                // Aseguramos que sea un arreglo iterar sobre él
                if (!Array.isArray(marcasProveedor)) {
                    marcasProveedor = marcasProveedor ? [marcasProveedor] : [];
                }

                // Inyectamos ÚNICAMENTE las marcas de este proveedor al dropdown
                marcasProveedor.forEach(m => {
                    marcaField.addSelectOption({ value: m.value, text: m.text });
                });

                // Comodidad: Si el proveedor solo tiene 1 marca, la seleccionamos por default
                if (marcasProveedor.length === 1 && !marcaId) {
                    marcaId = marcasProveedor[0].value;
                }

            } catch (e) {
                log.error({ title: 'SL_VistaA - Error filtrando marcas', details: e.message });
            }
        }

        // Asignamos el valor por default de la marca (ya sea que venía por URL o se auto-asignó)
        if (marcaId) {
            marcaField.defaultValue = marcaId;
        }

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
        }

        context.response.writePage(form);
    }

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