<!DOCTYPE html>
<html lang="en">

<head>
    <title>Llenar Plantilla</title>
    <link rel="shortcut icon" href="{{ asset('images/favicon.ico') }}" />

    <!-- Required meta tags -->
    <meta charset="UTF-8">
    <meta name="copyright" content="Nucli S.A.S.">
    <meta name="category" content="">
    <meta name="author" content="">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">

    <!-- CSRF Token -->
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <!-- Styles -->
    <link href="{{ asset('vendor/bootstrap/css/bootstrap.min.css') }}" rel="stylesheet">
    <link href="{{ asset('css/main.css') }}" rel="stylesheet">
    <link href="{{ asset('css/fill-template.css') }}" rel="stylesheet">
</head>

<body>
    <input id="idTemplate" type="hidden" name="idTemplate" value="{{ $id }}">
    <input id="urlApp" type="hidden" name="urlApp" value="{{ config('app.url') }}">
    <input id="csrfToken" type="hidden" name="csrfToken" value="{{ csrf_token() }}">

    <!-- Modal -->
    <div class="modal fade" id="modalFillFields" tabindex="-1" aria-labelledby="modalFillFieldsLabel"
        aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="modalFillFieldsLabel">Título de la Modal</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div id="contFields">

                    </div>
                </div>
                <div class="modal-footer">
                    <button id="saveFields" type="button" class="btn btn-success">Guardar</button>
                </div>
            </div>
        </div>
    </div>

    <h1>Visualizador y Llenado de PDF</h1>

    <!-- Controles para cargar y visualizar -->
    <div>
        <button id="prev-page">Anterior</button>
        <button id="next-page">Siguiente</button>
        <span>Página: <span id="page-num"></span> / <span id="page-count"></span></span>
        <button id="zoom-in">Zoom In</button>
        <button id="zoom-out">Zoom Out</button>
        <button id="fill-fields" onclick="openModalFillFields();">Llenar</button>
        <button id="guardar-campos" style="display:none;">Guardar</button>
    </div>

    <!-- Contenedor donde se renderizará el PDF -->
    <div id="pdf-container">
        <!-- En modo una página se usa un canvas con id="pdf-render". En modo todas se crearán múltiples canvases -->
        <canvas id="pdf-render"></canvas>
    </div>

    <div id="spinner"
        style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;">
        <div
            style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;">
        </div>
    </div>

    <!-- Incluir PDF.js y configurar el worker -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
    <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    </script>
    <!-- Incluir pdf-lib (versión 1.17.1 para compatibilidad) -->
    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>

    <script src="{{ asset('vendor/jquery/jquery.min.js') }}"></script>
    <script src="{{ asset('vendor/bootstrap/js/bootstrap.bundle.min.js') }}"></script>
    <script src="{{ asset('js/main.js') }}"></script>
    <script src="{{ asset('js/fill-template.js') }}"></script>
</body>

</html>
