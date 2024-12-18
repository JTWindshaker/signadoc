<!DOCTYPE html>
<html lang="en">

<head>
    <title>Plantillas</title>
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
    <link href="{{ asset('css/template.css') }}" rel="stylesheet">
</head>

<body>
    <input id="urlApp" type="hidden" name="urlApp" value="{{ config('app.url') }}">
    <input id="csrfToken" type="hidden" name="csrfToken" value="{{ csrf_token() }}">

    <!-- Botón para mostrar el formulario -->
    <button id="showAddTemplate">Agregar Nueva Plantilla</button>

    <div id="contPlantillas">

    </div>

    <div id="contFormNuevaPlantilla" class="hidden">
        <h3>Nueva Plantilla</h3>
        <form id="formNuevaPlantilla" enctype="multipart/form-data">
            <label for="nombre">Nombre de la plantilla:</label>
            <input type="text" id="nombre" name="nombre" required>

            <label for="descripcion">Descripción:</label>
            <textarea id="descripcion" name="descripcion" rows="4"></textarea>

            <label for="archivo">Cargar PDF:</label>
            <input type="file" id="archivo" name="archivo" accept="application/pdf" required>

            <button type="button" id="addTemplate">Guardar Plantilla</button>
        </form>
    </div>

    <div id="spinner"
        style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;">
        <div
            style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;">
        </div>
    </div>

    <!-- Scripts -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/konva@9/konva.min.js"></script>
    <script src="{{ asset('vendor/jquery/jquery.min.js') }}"></script>
    <script src="{{ asset('vendor/bootstrap/js/bootstrap.bundle.min.js') }}"></script>
    <script src="{{ asset('js/main.js') }}"></script>
    <script src="{{ asset('js/template.js') }}"></script>
</body>

</html>
