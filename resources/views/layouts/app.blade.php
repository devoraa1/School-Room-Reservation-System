<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Room Reservation')</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@400;600;700&display=swap">
    <link rel="stylesheet" href="{{ asset('css/style.css') }}">
    @stack('styles')
    <link rel="stylesheet" href="{{ asset('css/ui-kit.css') }}">
    <script>document.documentElement.setAttribute("data-theme", "light"); try { if (localStorage.getItem("rr-theme") === "dark") document.documentElement.removeAttribute("data-theme"); } catch (e) {}</script>
    <script>try { if (localStorage.getItem("rr-sidebar") === "collapsed") document.documentElement.classList.add("sidebar-collapsed"); } catch (e) {}</script>
</head>
<body class="@yield('body-class')">

@include('partials.icons')

@yield('content')

<script src="{{ asset('js/theme.js') }}"></script>
<script src="{{ asset('js/ui-kit.js') }}"></script>
@stack('scripts')
</body>
</html>