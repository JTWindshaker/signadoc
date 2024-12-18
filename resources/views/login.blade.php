<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Iniciar Sesión</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="{{ asset('css/main.css') }}" rel="stylesheet">
</head>

<body>
    <div class="container d-flex justify-content-center align-items-center vh-100">
        <form id="loginForm" class="border p-4 rounded shadow">
            @csrf
            <h2 class="text-center mb-4">Iniciar Sesión</h2>
            <div id="error-message" class="alert alert-danger d-none"></div>
            <div class="mb-3">
                <label for="email" class="form-label">Correo Electrónico</label>
                <input type="email" class="form-control" id="email" name="email" required autofocus
                    value="">
            </div>
            <div class="mb-3">
                <label for="password" class="form-label">Contraseña</label>
                <input type="password" class="form-control" id="password" name="password" required value="">
            </div>
            <button type="submit" class="btn btn-primary w-100">Iniciar Sesión</button>
        </form>
    </div>

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
    
    <script>
        $(document).ready(function() {
            $('#loginForm').on('submit', function(e) {
                e.preventDefault(); // Evitar el envío normal del formulario

                const csrfToken = '{{ csrf_token() }}'; // Token CSRF de Laravel
                const email = $('#email').val();
                const password = $('#password').val();

                $.ajax({
                    url: '{{ route('login.authenticate') }}', // Cambia por la ruta correcta
                    type: 'POST',
                    headers: {
                        'X-CSRF-TOKEN': csrfToken
                    },
                    data: {
                        email: email,
                        password: password,
                    },
                    dataType: 'json',
                    success: function(res) {
                        if (res.success) {
                            window.location.href = res.data.url // Redirige al dashboard
                        } else {
                            $('#error-message').text(res.message).removeClass(
                                'd-none'); // Muestra el mensaje de error
                        }
                    }
                });
            });
        });
    </script>
</body>

</html>
