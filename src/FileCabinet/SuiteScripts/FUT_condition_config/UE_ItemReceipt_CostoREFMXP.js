/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * UE_ItemReceipt_CostoREFMXP.js
 *
 * Calcula el COSTO REF y lo guarda en:
 *   - Línea del Item Receipt -> custcol_precio_unitario_real
 *   - Registro del Artículo  -> custitemcustitem_nso_refmxp
 *
 * Los porcentajes (Pronto Pago, Rebate, Crecimiento Extraordinario) ya NO
 * están hardcodeados: se buscan dinámicamente en el Custom Record
 * "Condiciones Comerciales" (customrecord_fut_condiciones_comerciales),
 * filtrando por Proveedor + Artículo + Activo = true.
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

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

    const factorIVA = 1.16; // 16% de IVA

    // Si en algún momento quieren que Crecimiento Extraordinario también
    // se reste en el Costo Neto, cambien esta bandera a true.
    const APLICAR_CRECIMIENTO_EN_COSTO_NETO = false;

    /**
     * Busca en el Custom Record de Condiciones Comerciales el registro
     * Activo que corresponda a un Proveedor + Artículo específicos.
     * Devuelve { prontoPago, rebate, crecimiento } en decimal (0.05 = 5%).
     * Si no encuentra nada, devuelve ceros y loguea un warning.
     */
    function getCondicionComercial(vendorId, itemId) {
        const result = { prontoPago: 0, rebate: 0, crecimiento: 0 };

        if (!vendorId || !itemId) {
            return result;
        }

        try {
            const condicionSearch = search.create({
                type: CUSTOM_RECORD_ID,
                filters: [
                    [FIELD.PROVEEDOR, 'anyof', vendorId],
                    'AND',
                    [FIELD.ARTICULO, 'anyof', itemId],
                    'AND',
                    [FIELD.ACTIVO, 'is', 'T']
                ],
                columns: [FIELD.PRONTO_PAGO, FIELD.REBATE, FIELD.CRECIMIENTO]
            });

            const resultSet = condicionSearch.run().getRange({ start: 0, end: 1 });

            if (resultSet && resultSet.length > 0) {
                const row = resultSet[0];

                // Los campos PERCENT en NetSuite se guardan/leen como número
                // "tal cual" (5 = 5%), así que se dividen entre 100 para
                // usarlos como factor decimal en la fórmula.
                const pp = parseFloat(row.getValue(FIELD.PRONTO_PAGO)) || 0;
                const rb = parseFloat(row.getValue(FIELD.REBATE)) || 0;
                const cr = parseFloat(row.getValue(FIELD.CRECIMIENTO)) || 0;

                result.prontoPago = pp / 100;
                result.rebate = rb / 100;
                result.crecimiento = cr / 100;
            } else {
                log.audit({
                    title: 'Condición Comercial no encontrada',
                    details: `Proveedor: ${vendorId} | Artículo: ${itemId} - se usarán porcentajes en 0`
                });
            }
        } catch (e) {
            log.error({
                title: 'Error buscando Condición Comercial',
                details: `Proveedor: ${vendorId} | Artículo: ${itemId} | Error: ${e.message}`
            });
        }

        return result;
    }

    const beforeSubmit = (scriptContext) => {
        // Ejecutar solo al crear o editar
        if (scriptContext.type !== scriptContext.UserEventType.CREATE &&
            scriptContext.type !== scriptContext.UserEventType.EDIT) {
            return;
        }

        const newRecord = scriptContext.newRecord;
        const itemCount = newRecord.getLineCount({ sublistId: 'item' });

        // Proveedor del Item Receipt (campo nativo "entity")
        const vendorId = newRecord.getValue({ fieldId: 'entity' });

        for (let i = 0; i < itemCount; i++) {

            let itemId = newRecord.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            let arribo = newRecord.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantity', // Cantidad arribo
                line: i
            });

            let costoFactura = newRecord.getSublistValue({
                sublistId: 'item',
                fieldId: 'rate', // Costo por linea
                line: i
            });

            if (itemId && arribo && costoFactura && !isNaN(costoFactura)) {

                // 0. Obtener los porcentajes dinámicos de Condiciones Comerciales
                const condicion = getCondicionComercial(vendorId, itemId);
                const pctProntoPago = condicion.prontoPago;
                const pctRebate = condicion.rebate;
                const pctCrecimiento = condicion.crecimiento; // disponible, ver bandera arriba

                // 1. Obtener el Stock, el Costo actual y el TIPO DE REGISTRO dentro de NetSuite
                let itemFields = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['averagecost', 'quantityonhand', 'recordtype']
                });

                let stockActual = parseFloat(itemFields.quantityonhand) || 0;
                let costoSistema = parseFloat(itemFields.averagecost) || 0;

                // Extraemos el tipo de registro (necesario para el paso 5)
                let itemRecordType = itemFields.recordtype;
                if (Array.isArray(itemRecordType)) {
                    itemRecordType = itemRecordType[0].value;
                } else if (typeof itemRecordType === 'object') {
                    itemRecordType = itemRecordType.value;
                }

                // CORRECCIÓN PARA CUANDO SE ESTE EDITANDO LA RECEPCIÓN
                if (scriptContext.type === scriptContext.UserEventType.EDIT) {
                    let valorTotalActual = stockActual * costoSistema;
                    let valorArriboOriginal = arribo * costoFactura;

                    stockActual = stockActual - arribo; // Cantidad anterior al arribo

                    let valorStockAnterior = valorTotalActual - valorArriboOriginal; // Valor total del Stock anterior

                    if (stockActual > 0) {
                        costoSistema = valorStockAnterior / stockActual;
                    } else {
                        costoSistema = 0;
                    }
                }

                // 2. Calcular COSTO NETO: (Costo factura - Pronto pago - Rebate [- Crecimiento]) * IVA
                let descuentoProntoPago = costoFactura * pctProntoPago;
                let descuentoRebate = costoFactura * pctRebate;
                let descuentoCrecimiento = APLICAR_CRECIMIENTO_EN_COSTO_NETO
                    ? costoFactura * pctCrecimiento
                    : 0;

                let costoNeto = (costoFactura - descuentoProntoPago - descuentoRebate - descuentoCrecimiento) * factorIVA;

                // 3. FORMULA COSTO REF
                let valorArribo = arribo * costoNeto;
                let valorStock = stockActual * costoSistema;
                let numerador = valorArribo + valorStock;

                let denominador = arribo + stockActual;

                let costoRef = 0;
                if (denominador > 0) {
                    costoRef = numerador / denominador;
                }

                // Log para ver las variables hasta este punto
                log.debug({
                    title: `Cálculo Costo Ref - Artículo: ${itemId} (Modo: ${scriptContext.type})`,
                    details: `Proveedor: ${vendorId} | Pronto Pago: ${pctProntoPago} | Rebate: ${pctRebate} | Stock Base: ${stockActual} | Costo Sistema: ${costoSistema} | Costo Neto: ${costoNeto} | COSTO REF: ${costoRef}`
                });

                // 4. Setear el costo ref en el campo de precio unitario real (Nivel Línea)
                newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_precio_unitario_real',
                    line: i,
                    value: costoRef
                });

                // 5. Setear el costo ref en el campo REFMXP dentro del registro del articulo
                if (itemRecordType) {
                    try {
                        record.submitFields({
                            type: itemRecordType,
                            id: itemId,
                            values: {
                                'custitemcustitem_nso_refmxp': costoRef
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true // Evita errores si hay otros campos obligatorios vacíos en el item
                            }
                        });
                        log.debug('Paso 5: Éxito', `Artículo ${itemId} actualizado en su registro principal con Costo Ref: ${costoRef}`);
                    } catch (e) {
                        log.error(`Error en Paso 5 - Artículo ${itemId}`, e.message);
                    }
                }
            }
        }
    };

    return {
        beforeSubmit: beforeSubmit
    };
});