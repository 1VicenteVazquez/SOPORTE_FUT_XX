/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaD.js
 */
define(['N/ui/serverWidget', 'N/record', 'N/log'], (serverWidget, record, log) => {

    // Cambiamos el ID del registro al nuevo Custom Record
    const CUSTOM_RECORD_ALCANCE_META = 'customrecord_fut_alcance_meta';

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') guardarPorcentaje(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const registroId = params.registroId;
        const isEdit = (params.mode === 'edit');

        // Configuración de la forma sin menú de navegación
        const form = serverWidget.createForm({ 
            title: isEdit ? 'Configurar Alcance Meta' : 'Alcance Meta',
            hideNavBar: true
        });

        // Script inyectado para poder cerrar la ventana
        form.addField({ id: 'custpage_close_script', type: serverWidget.FieldType.INLINEHTML, label: ' ' })
            .defaultValue = "<script>function cerrarPopup() { window.close(); }</script>";

        form.addField({ id: 'custpage_registro_id', type: serverWidget.FieldType.TEXT, label: 'ID' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = registroId;

        // Campo de Lista Desplegable (SELECT)
        const fldPorcentaje = form.addField({ id: 'custpage_porcentaje', type: serverWidget.FieldType.SELECT, label: 'Porcentaje de Alcance Meta (%)' });
        fldPorcentaje.addSelectOption({ value: '', text: '- N/A -' });
        
        // Ciclo para agregar valores del 0.1% al 10.0%
        for (let i = 1; i <= 100; i++) {
            let val = i / 10;
            fldPorcentaje.addSelectOption({ value: val.toString(), text: val.toFixed(1) + '%' });
        }

        // Si existe el ID, cargamos la información actual
        if (registroId) {
            try {
                const recAM = record.load({ type: CUSTOM_RECORD_ALCANCE_META, id: registroId });
                // Leemos el nuevo ID del campo de porcentaje
                const valActual = recAM.getValue('custrecord_fut_am_porcentaje');
                
                // Mapear el valor para que empate con las opciones del SELECT
                if (valActual !== null && valActual !== '') {
                    let valorParaSelect = parseFloat(valActual).toString();
                    if (!isNaN(valorParaSelect)) {
                        fldPorcentaje.defaultValue = valorParaSelect;
                    }
                }
            } catch (e) { log.error('Error cargando Alcance Meta', e.message); }
        }

        // Botones dinámicos según el modo
        if (isEdit) {
            fldPorcentaje.isMandatory = true;
            form.addSubmitButton({ label: 'Guardar y Cerrar' });
            form.addButton({ id: 'btn_cerrar', label: 'Cancelar', functionName: 'cerrarPopup' });
        } else {
            fldPorcentaje.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            form.addButton({ id: 'btn_cerrar', label: 'Cerrar Ventana', functionName: 'cerrarPopup' });
        }

        context.response.writePage(form);
    }

    function guardarPorcentaje(context) {
        const req = context.request;
        const registroId = req.parameters.custpage_registro_id;
        const porcentaje = req.parameters.custpage_porcentaje;

        if (registroId && porcentaje) {
            try {
                const recAM = record.load({ type: CUSTOM_RECORD_ALCANCE_META, id: registroId });
                
                // Guardamos en el campo interno correspondiente al Alcance Meta
                recAM.setValue({ fieldId: 'custrecord_fut_am_porcentaje', value: parseFloat(porcentaje) });
                
                recAM.save({ ignoreMandatoryFields: true });
            } catch (e) { log.error('Error guardando Alcance Meta', e.message); }
        }

        // Pantalla de éxito y recarga de la ventana padre
        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:40px;">
                <h3 style="color:#28a745;">¡Porcentaje de Alcance Meta guardado con éxito!</h3>
                <script>
                    setTimeout(function(){ 
                        if(window.opener) {
                            window.opener.location.reload(); 
                        }
                        window.close(); 
                    }, 1500);
                </script>
            </body></html>
        `);
    }

    return { onRequest };
});