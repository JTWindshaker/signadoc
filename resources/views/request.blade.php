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

    <div id="requests-container" class="container mt-4"></div>

    <form action="{{ url('/dashboard') }}" method="GET" style="display: inline;">
        <button type="submit" class="btn btn-primary">Ir al Dashboard</button>
    </form>

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        $(document).ready(function() {
            const csrfToken = '{{ csrf_token() }}'; // Token CSRF de Laravel

            $.ajax({
                url: '/list-request',
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': csrfToken
                },
                success: function(response) {
                    if (response.success) {
                        const requestsContainer = $('#requests-container');
                        requestsContainer
                            .empty(); // Limpia el contenedor antes de agregar nuevos elementos

                        response.data.forEach(function(request) {
                            const card = `
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Solicitud ID: ${request.id}</h5>
                                        <p class="card-text"><strong>Hash Documento:</strong> ${request.hash_documento}</p>
                                        <p class="card-text"><strong>Fecha Registro:</strong> ${request.fecha_registro}</p>
                                        <p class="card-text"><strong>Estado:</strong> ${request.estado ? 'Activo' : 'Inactivo'}</p>
                                        <p class="card-text"><strong>Estampa Usuario:</strong> ${request.estampa_usuario}</p>
                                        <p class="card-text"><strong>Estampa URL:</strong> ${request.estampa_url}</p>
                                        <p class="card-text"><strong>Firma Razón:</strong> ${request.firma_razon}</p>
                                        <p class="card-text"><strong>Firma Ubicación:</strong> ${request.firma_ubicacion}</p>
                                        <p class="card-text"><strong>QR Texto:</strong> ${request.qr_texto}</p>
                                        <p class="card-text"><strong>Con Estampa:</strong> ${request.con_estampa ? 'Sí' : 'No'}</p>
                                        <p class="card-text"><strong>Con Gráfico:</strong> ${request.con_grafico ? 'Sí' : 'No'}</p>
                                        <p class="card-text"><strong>Tipo de Firma ID:</strong> ${request.tipo_firma_id}</p>
                                        <p class="card-text"><strong>Email del Usuario:</strong> ${request.users_email}</p>
                                        <!-- Agrega más campos según sea necesario -->
                                    </div>
                                </div>
                            `;
                            requestsContainer.append(card);
                        });

                    }
                },
                error: function(xhr, status, error) {
                    console.error("Error fetching requests:", error);
                }
            });
        });
    </script>
</body>

</html>
