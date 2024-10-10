<?php

namespace App\Http\Controllers;

use App\Helpers\ProjectResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Throwable;

class LoginController extends Controller
{
    /**
     * Crear una nueva instancia del controlador.
     *
     * @return void
     */
    public function __construct() {}

    /**
     * Muestra el formulario de inicio de sesión.
     *
     * Si el usuario ya está autenticado, se redirige al dashboard.
     *
     */
    public function showLoginForm()
    {
        if (Auth::check()) {
            return redirect()->route('dashboard'); // Redirige si el usuario ya está autenticado
        }

        return view('login'); // Muestra la vista de inicio de sesión si no está autenticado
    }


    /**
     * Maneja un intento de autenticación.
     *
     * @param Request $request La solicitud HTTP que contiene las credenciales del usuario.
     * @return \Illuminate\Http\JsonResponse La respuesta JSON que contiene el resultado del inicio de sesión.
     */
    public function authenticate(Request $request): JsonResponse
    {
        try {
            // Validar las credenciales
            $request->validate([
                'email' => ['required', 'email'],
                'password' => ['required'],
            ]);

            $email = $request->email;
            $password = $request->password;
            // Intentar la autenticación
            if (Auth::attempt(['email' => $email, 'password' => $password])) {
                //PENDIENTE: FALTA LA VALIDACIÓN DEL ESTADO DE LA EMPRESA DE ESE USUARIO
                $request->session()->regenerate();

                // Envía la ruta deseada después de iniciar sesión
                return ProjectResponse::success(
                    [
                        'url' => 'dashboard',
                    ],
                );
            }

            // Si la autenticación falla, retornar un error
            return ProjectResponse::error('Las credenciales proporcionadas no coinciden con nuestros registros.', 401);
        } catch (Throwable $th) {
            // Manejo de errores en el proceso de autenticación
            return ProjectResponse::error('Ocurrió un error durante la autenticación.', 500, $th->getMessage());
        }
    }

    /**
     * Cierra la sesión del usuario autenticado.
     *
     * @param Request $request La solicitud HTTP.
     * @return \Illuminate\Http\RedirectResponse La respuesta de redirección a la página de inicio o donde se desee.
     */
    public function logout(Request $request): RedirectResponse
    {
        Auth::logout(); // Cierra la sesión del usuario
        $request->session()->invalidate(); // Invalida la sesión
        $request->session()->regenerateToken(); // Regenera el token CSRF

        return redirect('/login'); // Redirige a la página de inicio de sesión
    }
}
