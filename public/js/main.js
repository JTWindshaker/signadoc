let csrfToken = $("#csrfToken").val();

$(document).ready(function () {

});

/**
 * Función para realizar peticiones AJAX dinámicas con soporte de spinner
 * @param {string} url - La URL a la que se enviará la solicitud
 * @param {string} method - El método HTTP (GET, POST, PUT, DELETE, etc.)
 * @param {object} data - Datos a enviar en el cuerpo de la solicitud (para POST, PUT, etc.)
 * @param {function} onSuccess - Función callback para manejar la respuesta exitosa
 * @param {function} onError - Función callback para manejar errores
 * @param {object} [headers={'X-CSRF-TOKEN': csrfToken}] - (Opcional) Encabezados personalizados para la solicitud
 * @param {boolean} [async=true] - (Opcional) Indica si la solicitud es asíncrona
 * @param {function} [onStartSpinner] - (Opcional) Función para mostrar el spinner
 * @param {function} [onStopSpinner] - (Opcional) Función para ocultar el spinner
 */
function ajaxRequest(
    {
        url,
        method = 'GET',
        data = {},
        onSuccess,
        onError,
        headers = { 'X-CSRF-TOKEN': csrfToken },
        async = true,
        processData = true,
        contentType = 'application/json; charset=UTF-8',
        onStartSpinner = showSpinner,
        onStopSpinner = hideSpinner
    }) {
    if (typeof onStartSpinner === 'function') {
        onStartSpinner();
    }

    $.ajax({
        url: url,
        method: method,
        data: data instanceof FormData ? data : JSON.stringify(data),
        processData: processData,
        contentType: contentType,
        dataType: 'json',
        headers: headers,
        async: async,
        success: function (response) {
            if (typeof onSuccess === 'function') {
                onSuccess(response);
            }
        },
        error: function (xhr, status, error) {
            if (typeof onError === 'function') {
                onError(xhr, status, error);
            } else {
                console.error(`Error: ${status} - ${error}`);
            }
        },
        complete: function () {
            if (typeof onStopSpinner === 'function') {
                onStopSpinner();
            }
        }
    });
}

function showSpinner() {
    $('#spinner').fadeIn(200);
}

function hideSpinner() {
    setTimeout(() => {
        $('#spinner').fadeOut(200);
    }, 500);
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}