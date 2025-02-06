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
    <link href="{{ asset('vendor/bootstrap/css/bootstrap.min.css') }}" rel="stylesheet">
    <link href="{{ asset('css/main.css') }}" rel="stylesheet">
    <link href="{{ asset('css/edit-template.css') }}" rel="stylesheet">
</head>

<body>
    <input id="idTemplate" type="hidden" name="idTemplate" value="{{ $id }}">
    <input id="urlApp" type="hidden" name="urlApp" value="{{ config('app.url') }}">
    <input id="csrfToken" type="hidden" name="csrfToken" value="{{ csrf_token() }}">

    <div id="propertiesContent" class="">
        <div class="container">
            <h3 class="mt-4">Propiedades</h3>

            <!-- Fuente: Texto, Select -->
            <div class="form-group typeProperties textProperties selectProperties">
                <label class="form-label" for="fontSelect">Fuente:</label>
                <select id="fontSelect" name="fontSelect" class="form-control">
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Calibri">Calibri</option>
                </select>
            </div>

            <!-- Tamaño: Texto, Select -->
            <div class="form-group typeProperties textProperties selectProperties">
                <label class="form-label" for="fontSizeSelect">Tamaño:</label>
                <select id="fontSizeSelect" name="fontSizeSelect" class="form-control">
                    <option value="12">12 px</option>
                    <option value="14">14 px</option>
                    <option value="16">16 px</option>
                    <option value="18">18 px</option>
                    <option value="20">20 px</option>
                    <option value="24">24 px</option>
                    <option value="32">32 px</option>
                    <option value="40">40 px</option>
                </select>
            </div>

            <!-- Estilos de fuente: Texto, Select -->
            <div class="form-group typeProperties textProperties selectProperties">
                <label class="form-label">Estilo:</label>
                <div id="propItalic" class="styleButton btn btn-outline-secondary" title="Cursiva">Italic</div>
                <div id="propBold" class="styleButton btn btn-outline-secondary" title="Negrita">Bold</div>
                <div id="propStrikethrough" class="styleButton btn btn-outline-secondary" title="Tachado">Tachado</div>
                <div id="propUnderline" class="styleButton btn btn-outline-secondary" title="Subrayado">Subrayado</div>
            </div>

            <!-- Placeholder: Texto -->
            <div class="form-group typeProperties textProperties selectProperties">
                <label class="form-label" for="placeholder">Placeholder:</label>
                <input class="form-control" type="text" id="placeholder" name="placeholder"
                    placeholder="-- Escribe aquí --" value="">
            </div>

            <!-- Imagen: Image -->
            <div class="form-group typeProperties imgProperties">
                <label class="form-label" for="imageFile">Cambiar imagen:</label>
                <input type="file" id="imageFile" class="form-control" accept="image/*" />
            </div>

            <!-- Opacidad: Image -->
            <div class="form-group typeProperties imgProperties">
                <label class="form-label" for="imageOpacityRange">Opacidad:</label>
                <input type="range" id="imageOpacityRange" min="0" max="1" step="0.1" value="1"
                    class="form-control-range" />
                <span id="opacityValue">1</span>
            </div>

            <!-- Editable: Texto, Select, Image -->
            <div class="form-group typeProperties textProperties selectProperties imgProperties">
                <label class="form-label" for="isEditable">
                    Editable:
                    <input type="checkbox" id="isEditable" name="isEditable" checked>
                </label>
            </div>

            <!-- Alineación: Texto, Select -->
            <div class="form-group typeProperties textProperties selectProperties">
                <label class="form-label">Alineación:</label>
                <div id="propAlignLeft" class="alignButton btn btn-outline-secondary" title="Izquierda">Left</div>
                <div id="propAlignCenter" class="alignButton btn btn-outline-secondary" title="Centro">Center</div>
                <div id="propAlignRight" class="alignButton btn btn-outline-secondary" title="Derecha">Right</div>
            </div>

            <!-- Color: Texto, Select -->
            <div class="form-group typeProperties textProperties selectProperties">
                <label class="form-label" for="fontColor">Color:</label>
                <input class="form-control" type="color" id="fontColor" name="fontColor" value="#000000">
            </div>

            <!-- Opciones: Select -->
            <div id="options-container" class="form-group typeProperties selectProperties">
                <button id="add-option-btn" class="btn btn-primary">Agregar Opción</button>

                <!-- Opción inicial -->
                <div class="option">
                    <input type="radio" name="defaultOption" data-value="0" checked>
                    <input type="text" class="option-input form-control" placeholder="Nueva opción"
                        data-value="0" value="-- Seleccione --">
                </div>
            </div>

            <div class="form-group typeProperties textProperties selectProperties imgProperties">
                <button id="saveProperties" type="button" class="btn btn-success">Guardar</button>
            </div>

            <div class="form-group typeProperties textProperties selectProperties imgProperties">
                <button id="deleteAnnotation" type="button" class="btn btn-danger">Eliminar Campo</button>
            </div>
        </div>
    </div>

    <div id="toolbar"></div>
    <div id="pdf-container"></div>

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
    <script src="{{ asset('js/edit-template.js') }}"></script>
</body>

</html>
