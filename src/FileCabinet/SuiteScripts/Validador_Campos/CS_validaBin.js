/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/ui/dialog', 'N/record'], (dialog, record) => {

    /**
     * @param {string|number} itemId
     * @param {string} itemType 
     * @returns {boolean}
     */
    const itemRequiresBin = (itemId, itemType) => {
        // Tipos que nunca tienen inventory detail
        const NON_INVENTORY_TYPES = [
            'Assembly',     // kititem 
            'NonInvtPart',  // Non-inventory item
            'OthCharge',    // Other charge
            'Service',      // Service item
            'Discount',     // Discount item
            'Markup',       // Markup item
            'Subtotal',     // Subtotal item
            'Description',  // Description item
            'Payment',      // Payment item
        ];

        if (!itemId || NON_INVENTORY_TYPES.includes(itemType)) {
            return false;
        }

        try {
            const itemFields = record.load({
                type: resolveItemRecordType(itemType),
                id: itemId,
                isDynamic: false
            });
            return !!itemFields.getValue({ fieldId: 'usebins' });
        } catch (e) {
            log.debug('itemRequiresBin', `No se pudo cargar el item ${itemId}: ${e.message}`);
            return false;
        }
    };

    /**
     * @param {string} itemType
     * @returns {string}
     */
    const resolveItemRecordType = (itemType) => {
        const TYPE_MAP = {
            'InvtPart':     record.Type.INVENTORY_ITEM,
            'Assembly':     record.Type.ASSEMBLY_ITEM,
            'Kit':          record.Type.KIT_ITEM,
            'NonInvtPart':  record.Type.NON_INVENTORY_ITEM,
            'OthCharge':    record.Type.OTHER_CHARGE_ITEM,
            'Service':      record.Type.SERVICE_ITEM,
            'Lot':          record.Type.LOT_NUMBERED_INVENTORY_ITEM,
            'SerializedInvt': record.Type.SERIALIZED_INVENTORY_ITEM,
            'LotAssembly':  record.Type.LOT_NUMBERED_ASSEMBLY_ITEM,
            'SerializedAssembly': record.Type.SERIALIZED_ASSEMBLY_ITEM,
        };
        return TYPE_MAP[itemType] || record.Type.INVENTORY_ITEM;
    };

    const saveRecord = (context) => {
        const currentRecord = context.currentRecord;
        const lineCount = currentRecord.getLineCount({ sublistId: 'item' });

        let lineasConError = [];

        for (let i = 0; i < lineCount; i++) {

            // 1 Recibe linea?
            const isReceiving = currentRecord.getSublistValue({
                sublistId: 'item',
                fieldId: 'itemreceive',
                line: i
            });
            if (!isReceiving) continue;

            // 2 inventory item que requiere bin?
            const itemId   = currentRecord.getSublistValue({ sublistId: 'item', fieldId: 'item',     line: i });
            const itemType = currentRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });

            if (!itemRequiresBin(itemId, itemType)) continue;

            // 3 Validar que tenga bin
            try {
                currentRecord.selectLine({ sublistId: 'item', line: i });

                const invDetail = currentRecord.getCurrentSublistSubrecord({
                    sublistId: 'item',
                    fieldId:   'inventorydetail'
                });

                if (!invDetail) {
                    // usebins=true pero no hay subregistro = error
                    lineasConError.push(i + 1);
                    continue;
                }

                const assignmentCount = invDetail.getLineCount({ sublistId: 'inventoryassignment' });

                if (assignmentCount === 0) {
                    lineasConError.push(i + 1);
                    continue;
                }

                let hasValidBin = false;
                for (let j = 0; j < assignmentCount; j++) {
                    const binNumber = invDetail.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId:   'binnumber',
                        line: j
                    });
                    if (binNumber) { hasValidBin = true; break; }
                }

                if (!hasValidBin) {
                    lineasConError.push(i + 1);
                }

            } catch (e) {
                // Si el subregistro no es accesible no bloqueamos
                log.debug('saveRecord', `Error leyendo inventorydetail en línea ${i + 1}: ${e.message}`);
            }
        }

        if (lineasConError.length > 0) {
            dialog.alert({
                title: 'Error de Validación',
                message: `Falta asignar un Bin Number en el Detalle de Inventario.<br><br>` +
                         `<b>Línea(s) con error: ${lineasConError.join(', ')}</b><br><br>` +
                         `Abre el Detalle de Inventario de cada línea y asigna un depósito.` 
            });
            return false;
        }

        return true;
    };

    return { saveRecord };
});