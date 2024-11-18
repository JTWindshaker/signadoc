<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Iniciar Sesión</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="{{ asset('css/style.css') }}" rel="stylesheet">
</head>

<body>
    <form id="form" class="container mt-4">
        @csrf

        <div class="mb-3">
            <label for="base64PDF" class="form-label">PDF:</label>
            <input type="file" name="base64PDF" id="base64PDF" class="form-control" accept=".pdf">
        </div>

        <div class="mb-3">
            <label for="base64P12" class="form-label">P12:</label>
            <input type="file" name="base64P12" id="base64P12" class="form-control" accept=".p12">
        </div>

        <div class="mb-3">
            <label for="passP12" class="form-label">Contraseña P12:</label>
            <input type="text" name="passP12" id="passP12" class="form-control"
                value="representante_legal_pruebas">
        </div>

        <div class="mb-3 form-check">
            <input type="checkbox" name="withStamp" id="withStamp" class="form-check-input" checked>
            <label for="withStamp" class="form-check-label">Con Sello</label>
        </div>

        <div class="mb-3">
            <label for="urlStamp" class="form-label">URL Sello:</label>
            <input type="text" name="urlStamp" id="urlStamp" class="form-control" value="tsa.andesscd.com.co">
        </div>

        <div class="mb-3">
            <label for="userStamp" class="form-label">Usuario Sello:</label>
            <input type="text" name="userStamp" id="userStamp" class="form-control" value="usuariointerno">
        </div>

        <div class="mb-3">
            <label for="passStamp" class="form-label">Contraseña Sello:</label>
            <input type="text" name="passStamp" id="passStamp" class="form-control" value="5QlC3Bm2">
        </div>

        <div class="mb-3">
            <label for="visibleSign" class="form-label">Visibilidad Firma:</label>
            <select name="visibleSign" id="visibleSign" class="form-select">
                <option value="1">Invisible</option>
                <option value="2" selected>Visible</option>
                <option value="3">Visible dos</option>
            </select>
        </div>

        <div class="mb-3">
            <label for="imgSign" class="form-label">Imagen de Firma:</label>
            <input type="file" name="imgSign" id="imgSign" class="form-control" accept="image/*">
        </div>

        <h3>Posición de Firma</h3>
        <div class="mb-3">
            <label for="pageSign" class="form-label">Página:</label>
            <input type="text" name="pageSign" id="pageSign" class="form-control" value="1">
        </div>
        <div class="mb-3">
            <label for="xSign" class="form-label">X:</label>
            <input type="text" name="xSign" id="xSign" class="form-control" value="50">
        </div>
        <div class="mb-3">
            <label for="ySign" class="form-label">Y:</label>
            <input type="text" name="ySign" id="ySign" class="form-control" value="50">
        </div>
        <div class="mb-3">
            <label for="widthSign" class="form-label">Ancho:</label>
            <input type="text" name="widthSign" id="widthSign" class="form-control" value="180">
        </div>
        <div class="mb-3">
            <label for="heightSign" class="form-label">Alto:</label>
            <input type="text" name="heightSign" id="heightSign" class="form-control" value="60">
        </div>

        <div class="mb-3 form-check">
            <input type="checkbox" name="graphicSign" id="graphicSign" class="form-check-input" checked>
            <label for="graphicSign" class="form-check-label">Firma Gráfica</label>
        </div>

        <div class="mb-3">
            <label for="base64GraphicSign" class="form-label">Imagen Gráfica:</label>
            <input type="file" name="base64GraphicSign" id="base64GraphicSign" class="form-control"
                accept="image/*">
        </div>

        <div class="mb-3">
            <label for="backgroundSign" class="form-label">Fondo de Firma:</label>
            <input type="file" name="backgroundSign" id="backgroundSign" class="form-control" accept="image/*">
        </div>

        <div class="mb-3">
            <label for="reasonSign" class="form-label">Razón de Firma:</label>
            <input type="text" name="reasonSign" id="reasonSign" class="form-control" value="Razon Test">
        </div>

        <div class="mb-3">
            <label for="locationSign" class="form-label">Ubicación de Firma:</label>
            <input type="text" name="locationSign" id="locationSign" class="form-control"
                value="Ubicacion Test">
        </div>

        <h3>QR Code</h3>
        <div class="mb-3">
            <label for="qrPage" class="form-label">Página:</label>
            <input type="text" name="qrPage" id="qrPage" class="form-control" value="1">
        </div>
        <div class="mb-3">
            <label for="qrX" class="form-label">X:</label>
            <input type="text" name="qrX" id="qrX" class="form-control" value="0">
        </div>
        <div class="mb-3">
            <label for="qrY" class="form-label">Y:</label>
            <input type="text" name="qrY" id="qrY" class="form-control" value="0">
        </div>
        <div class="mb-3">
            <label for="qrSize" class="form-label">Tamaño QR:</label>
            <input type="text" name="qrSize" id="qrSize" class="form-control" value="100">
        </div>

        <div class="mb-3">
            <label for="txtQR" class="form-label">Texto QR:</label>
            <input type="text" name="txtQR" id="txtQR" class="form-control" value="QR desde Web">
        </div>

        <button type="button" id="submitForm" class="btn btn-primary">Enviar</button>
    </form>

    <form action="/logout" method="POST" style="display: inline;">
        @csrf
        <button type="submit">Cerrar Sesión</button>
    </form>

    <form action="{{ route('request') }}" method="GET" style="display: inline;">
        <button type="submit">Solicitudes</button>
    </form>

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        $(document).ready(function() {
            function downloadBase64File(base64String, filename) {
                // Crea un enlace temporal usando jQuery
                const link = $('<a></a>');

                // Establece el href con la cadena base64
                link.attr('href',
                    `data:application/pdf;base64,${base64String}`); // Cambia el tipo MIME según sea necesario
                link.attr('download', filename); // Establece el nombre del archivo

                // Agrega el enlace al body (es necesario para algunos navegadores)
                $('body').append(link);

                // Simula un clic en el enlace
                link[0].click();

                // Elimina el enlace temporal
                link.remove();
            }

            $('#submitForm').on('click', function() {
                let formData = new FormData();
                const csrfToken = '{{ csrf_token() }}'; // Token CSRF de Laravel

                // Función para convertir archivo a base64
                const convertToBase64 = (fileInput) => {
                    return new Promise((resolve, reject) => {
                        if (fileInput.files.length > 0) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                // Extraer solo la parte base64
                                const base64String = reader.result.split(',')[1];
                                resolve(base64String);
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(fileInput.files[0]);
                        } else {
                            resolve(null);
                        }
                    });
                };

                // Convierte archivos a base64 y maneja las promesas
                Promise.all([
                    convertToBase64($('#base64PDF')[0]),
                    convertToBase64($('#base64P12')[0]),
                    convertToBase64($('#imgSign')[0]),
                    convertToBase64($('#base64GraphicSign')[0]),
                    convertToBase64($('#backgroundSign')[0]),
                ]).then(
                    (results) => {
                        if (results[0] !== null && results[0] !== "null") {
                            formData.append('base64PDF', results[0]);
                        } else {
                            formData.append('base64PDF', "");
                        }

                        if (results[1] !== null && results[1] !== "null") {
                            formData.append('base64P12', results[1]);
                        } else {
                            formData.append('base64P12', "");
                        }

                        if (results[2] !== null && results[2] !== "null") {
                            formData.append('imgSign', results[2]);
                        } else {
                            formData.append('imgSign', "");
                        }

                        if (results[3] !== null && results[3] !== "null") {
                            formData.append('base64GraphicSign', results[3]);
                        } else {
                            formData.append('base64GraphicSign', "");
                        }

                        if (results[4] !== null && results[4] !== "null") {
                            formData.append('backgroundSign', results[4]);
                        } else {
                            formData.append('backgroundSign', "");
                        }

                        formData.append('passP12', $('#passP12').val());
                        formData.append('withStamp', $('#withStamp').is(':checked') ? 1 : 0);
                        formData.append('urlStamp', $('#urlStamp').val());
                        formData.append('userStamp', $('#userStamp').val());
                        formData.append('passStamp', $('#passStamp').val());
                        formData.append('visibleSign', $('#visibleSign').val());

                        const posSignValues = [
                            $('#pageSign').val(),
                            $('#xSign').val(),
                            $('#ySign').val(),
                            $('#widthSign').val(),
                            $('#heightSign').val()
                        ];

                        if (posSignValues.every(value => value !== null && value !== "null" && value !==
                                '')) {
                            formData.append('posSign', posSignValues.join(','));
                        } else {
                            formData.append('posSign', "");
                        }

                        formData.append('graphicSign', $('#graphicSign').is(':checked') ? 1 : 0);

                        formData.append('reasonSign', $('#reasonSign').val());
                        formData.append('locationSign', $('#locationSign').val());

                        // Verificar inputs relacionados con QR
                        const qrValues = [
                            $('#qrPage').val(),
                            $('#qrX').val(),
                            $('#qrY').val(),
                            $('#qrSize').val()
                        ];

                        if (qrValues.every(value => value !== null && value !== "null" && value !==
                                '')) {
                            formData.append('infoQR', qrValues.join(','));
                        } else {
                            formData.append('infoQR', "");
                        }

                        formData.append('txtQR', $('#txtQR').val());

                        // Enviar la solicitud AJAX
                        $.ajax({
                            url: "/sign",
                            type: "POST",
                            headers: {
                                'X-CSRF-TOKEN': csrfToken
                            },
                            data: formData,
                            processData: false,
                            contentType: false,
                            success: function(res) {
                                if (res.success) {
                                    downloadBase64File(res.data.pdf, 'ResultSign.pdf');
                                } else {
                                    alert(res.message);
                                }
                            }
                        });
                    }).catch((error) => {
                    console.error('Error al convertir archivos a base64:', error);
                    alert('Ocurrió un error al procesar los archivos.');
                });
            });
        });
    </script>
</body>

</html>
