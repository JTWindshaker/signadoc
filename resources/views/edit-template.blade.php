<!DOCTYPE html>
<html lang="en">

<head>
    <title>Editar Plantilla</title>
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
    <link rel="stylesheet" href="https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css" crossorigin="anonymous">
    <link href="{{ asset('vendor/bootstrap/css/bootstrap.min.css') }}" rel="stylesheet">
    <link href="{{ asset('css/main.css') }}" rel="stylesheet">
    <link href="{{ asset('css/edit-template.css') }}" rel="stylesheet">
</head>

<body>
    <input id="idTemplate" type="hidden" name="idTemplate" value="{{ $id }}">
    <input id="urlApp" type="hidden" name="urlApp" value="{{ config('app.url') }}">
    <input id="csrfToken" type="hidden" name="csrfToken" value="{{ csrf_token() }}">

    <h1>Visualizador y Editor de PDF - Flattening (Solo Texto e Imagen)</h1>

    <!-- Controles para cargar y visualizar -->
    <div>
        <!-- Controles para modo una página (edición) -->
        <button id="prev-page">Anterior</button>
        <button id="next-page">Siguiente</button>
        <span>Página: <span id="page-num"></span> / <span id="page-count"></span></span>
        <button id="zoom-in">Zoom In</button>
        <button id="zoom-out">Zoom Out</button>
        <button id="guardar-campos" style="display:none;">Guardar</button>
        <div id="toolbar"></div>
    </div>

    {{-- Panel de propiedades --}}
    <div id="field-properties" class="hidden">
        <h3>Propieades</h3>

        <div class="contProp propText propDate propTextarea propDropdown hidden">
            <label for="font-family">Fuente:</label>
            <select id="font-family">
                <option value="Courier">Courier</option>
                <option value="Helvetica">Helvetica</option>
                <option value="TimesRoman">Times Roman</option>
            </select>
        </div>

        <div class="contProp propText propDate propTextarea propDropdown hidden">
            <label for="font-size">Tamaño de Fuente:</label>
            <input type="number" id="font-size" value="12" min="6" max="72">
        </div>

        <div class="contProp propText propDate propTextarea propDropdown hidden">
            <label>
                <input type="checkbox" id="font-bold">
                Negrita
            </label>
        </div>

        <div class="contProp propText propDate propTextarea propDropdown hidden">
            <label>
                <input type="checkbox" id="font-italic">
                Cursiva
            </label>
        </div>

        <div class="contProp propText propDate propTextarea propDropdown hidden">
            <label for="font-color">Color de Fuente:</label>
            <input type="color" id="font-color" value="#000000">
        </div>

        <div class="contProp propDate hidden">
            <label for="format-date">Formato:</label>
            <select id="format-date">
                <option value="mm/dd/yy">mm/dd/yy</option>
                <option value="dd/mm/yy">dd/mm/yy</option>
                <option value="yy/mm/dd">yy/mm/dd</option>
                <option value="mm-dd-yy">mm-dd-yy</option>
                <option value="dd-mm-yy">dd-mm-yy</option>
                <option value="yy-mm-dd">yy-mm-dd</option>
            </select>
        </div>

        <div class="contProp propDate hidden">
            <label for="min-date">Fecha mínima:</label>
            <input type="text" id="min-date" value="" class="inputDate">
        </div>

        <div class="contProp propDate hidden">
            <label for="max-date">Fecha mínima:</label>
            <input type="text" id="max-date" value="" class="inputDate">
        </div>

        <div class="contProp propDropdown hidden">
            <h4>Opciones</h4>
            <div id="select-options-container">

            </div>
            <button id="add-option">Agregar opción</button>
        </div>

        <div class="contProp hidden">
            <label for="image-file">Seleccionar imagen:</label>
            <input type="file" id="image-file" accept="image/png, image/jpeg">
        </div>

        <div class="contProp propQR hidden">
            <label for="image-opacity">Opacidad:</label>
            <input type="range" id="image-opacity" min="0" max="1" step="0.1" value="1">
            <span id="image-opacity-value">1</span>
        </div>

        <button id="apply-properties">Aplicar Propiedades</button>
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
    <script src="https://code.jquery.com/ui/1.14.1/jquery-ui.min.js" crossorigin="anonymous"></script>
    <script src="{{ asset('vendor/bootstrap/js/bootstrap.bundle.min.js') }}"></script>
    <script src="{{ asset('js/main.js') }}"></script>
    <script src="{{ asset('js/edit-template.js') }}"></script>
</body>

</html>
