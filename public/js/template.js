$(document).ready(function () {
    // Mostrar formulario y ocultar lista de plantillas
    $('#showAddTemplate').click(function () {
        $('#contPlantillas').addClass('hidden');
        $('#contFormNuevaPlantilla').removeClass('hidden');
    });

    // Botón para agregar plantilla (envío del formulario)
    $('#addTemplate').click(function () {
        let formData = new FormData($('#formNuevaPlantilla')[0]);

        ajaxRequest({
            url: '/template/create',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            onSuccess: function (response) {
                alert('Plantilla agregada correctamente');
                console.log(response);

                // Resetear el formulario
                $('#formNuevaPlantilla')[0].reset();

                // Ocultar formulario y mostrar plantillas
                $('#contFormNuevaPlantilla').addClass('hidden');
                $('#contPlantillas').removeClass('hidden');

                // Aquí puedes recargar la lista de plantillas
                loadTemplates();
            },
            onError: function (xhr, status, error) {
                console.error('Error:', error);
                alert('Ocurrió un error al agregar la plantilla.');
            }
        });
    });
    loadTemplates();
});

function loadTemplates() {
    ajaxRequest({
        url: '/template/list-templates',
        method: 'POST',
        onSuccess: function (response) {
            const $contenedor = $('#contPlantillas');
            $contenedor.empty(); // Limpiar el contenedor antes de agregar nuevas tarjetas

            // Recorrer cada plantilla y crear una tarjeta
            response.data.forEach(function (data) {
                const estado = data.estado ? 'Activo' : 'Inactivo';
                const fechaRegistro = new Date(data.fecha_registro).toLocaleString();

                // Crear la tarjeta como elemento HTML
                const $card = $(`
                    <div class="card mb-3" style="border: 1px solid #ddd; border-radius: 8px; padding: 16px;">
                        <h5 class="card-title">${data.nombre}</h5>
                        <p class="card-text"><strong>Estado:</strong> ${estado}</p>
                        <p class="card-text"><strong>Fecha de Registro:</strong> ${fechaRegistro}</p>
                        <div class="btn-group">
                            <button class="btn btn-primary btn-sm btn-editar" data-id="${data.id}">Editar</button>
                            <button class="btn btn-danger btn-sm btn-eliminar" data-id="${data.id}">Eliminar</button>
                        </div>
                    </div>
                `);

                // Agregar la tarjeta al contenedor
                $contenedor.append($card);
            });

            // Eventos para los botones Editar y Eliminar
            $('.btn-editar').on('click', function () {
                const id = $(this).data('id');
                console.log('Editar plantilla con ID:', id);
                window.location.href = `/edit-template/${id}`;
            });

            $('.btn-eliminar').on('click', function () {
                const id = $(this).data('id');
                deleteTemplate(id);
            });
        },
        onError: function (xhr, status, error) {
            console.error('onError:', status, error);
        }
    });
}

function deleteTemplate(id) {
    ajaxRequest({
        url: '/template/delete',
        method: 'POST',
        data: {
            id: id,
        },
        onSuccess: function (response) {
            console.log("Eliminado correctamente");
            loadTemplates();
        },
        onError: function (xhr, status, error) {
            console.error('onError:', status, error);
        }
    });
}