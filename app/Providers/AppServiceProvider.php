<?php

namespace App\Providers;

use App\Services\PdfSignerService;
use App\Services\ResponseService;
use Illuminate\Support\ServiceProvider;
use Laravel\Passport\Passport;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(ResponseService::class, function ($app) {
            return new ResponseService();
        });
        
        $this->app->singleton(PdfSignerService::class, function ($app) {
            return new PdfSignerService();
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Passport::tokensExpireIn(now()->addHour());
        Passport::refreshTokensExpireIn(now()->addMonth());

        //PARA TEST DEL APP MÓVIL
        // Passport::tokensExpireIn(now()->addCentury());
        // Passport::refreshTokensExpireIn(now()->addCentury());

        Passport::personalAccessTokensExpireIn(now());
        Passport::enablePasswordGrant();
    }
}
