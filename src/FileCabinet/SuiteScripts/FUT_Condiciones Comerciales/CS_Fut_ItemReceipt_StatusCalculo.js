/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_ItemReceipt_StatusCalculo.js
 */
define(['N/currentRecord', 'N/search', 'N/ui/message', 'N/log'], (currentRecord, search, message, log) => {

    const FIELD_STATUS = 'custbody_fut_status_calculo';
    const POLL_INTERVAL_MS = 4000;
    const MAX_INTENTOS = 45;

    let pollTimer = null;
    let intentos = 0;

    function pageInit(context) {
        const rec = currentRecord.get();
        const recordId = rec.id;

        log.debug({ title: '[CS_StatusCalculo] pageInit ejecutado', details: 'recordId: ' + recordId });

        if (!recordId) {
            log.debug({ title: '[CS_StatusCalculo] Sin recordId', details: 'Registro nuevo sin guardar aún. Se detiene aquí.' });
            return;
        }

        const estado = rec.getValue({ fieldId: FIELD_STATUS });
        log.debug({ title: '[CS_StatusCalculo] Estado leído al cargar', details: estado });

        if (estado === 'PROCESANDO') {
            log.debug({ title: '[CS_StatusCalculo] Iniciando monitoreo (polling)', details: 'recordId: ' + recordId });
            iniciarMonitoreo(recordId);
        } else if (estado === 'EXITO' || estado === 'ERROR') {
            mostrarMensajeUnaVez(recordId, estado);
        } else {
            log.debug({ title: '[CS_StatusCalculo] Estado no reconocido o vacío', details: estado });
        }
    }

    function iniciarMonitoreo(recordId) {
        pollTimer = setInterval(() => {
            intentos++;
            const estadoActual = consultarEstado(recordId);

            log.debug({
                title: `[CS_StatusCalculo] Intento ${intentos}/${MAX_INTENTOS}`,
                details: 'Estado actual: ' + estadoActual
            });

            if (estadoActual === 'EXITO' || estadoActual === 'ERROR') {
                clearInterval(pollTimer);
                log.debug({ title: '[CS_StatusCalculo] Estado final detectado', details: estadoActual });
                mostrarMensaje(estadoActual);
                sessionStorage.setItem('fut_calc_' + recordId, estadoActual);
            } else if (intentos >= MAX_INTENTOS) {
                clearInterval(pollTimer);
                log.debug({ title: '[CS_StatusCalculo] Máximo de intentos alcanzado', details: 'Se detiene el polling sin detectar cambio.' });
            }
        }, POLL_INTERVAL_MS);
    }

    function consultarEstado(recordId) {
        try {
            const lookup = search.lookupFields({
                type: search.Type.ITEM_RECEIPT,
                id: recordId,
                columns: [FIELD_STATUS]
            });
            return lookup[FIELD_STATUS];
        } catch (e) {
            log.error({ title: '[CS_StatusCalculo] ERROR en lookupFields', details: e.message });
            return null;
        }
    }

    function mostrarMensajeUnaVez(recordId, estado) {
        const yaMostrado = sessionStorage.getItem('fut_calc_' + recordId);
        log.debug({
            title: '[CS_StatusCalculo] Verificando si ya se mostró',
            details: `yaMostrado: ${yaMostrado} | estado actual: ${estado}`
        });
        if (yaMostrado === estado) return;
        mostrarMensaje(estado);
        sessionStorage.setItem('fut_calc_' + recordId, estado);
    }

    function mostrarMensaje(estado) {
        log.debug({ title: '[CS_StatusCalculo] Ejecutando message.create()', details: 'estado: ' + estado });

        if (estado === 'EXITO') {
            message.create({
                title: 'Cálculo completado',
                message: 'El costo de referencia (REF) se calculó correctamente.',
                type: message.Type.CONFIRMATION
            }).show({ duration: 3000 });
        } else if (estado === 'ERROR') {
            message.create({
                title: 'Error en el cálculo',
                message: 'Hubo errores al calcular el costo de referencia. Revisa el correo con el reporte para más detalles.',
                type: message.Type.ERROR
            }).show({ duration: 3000 });
        }
    }

    return { pageInit };
});