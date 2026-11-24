<script>
    // Values the dashboard scripts need from Laravel.
    window.APP = {
        apiBase: @json(url('/api')),
        loginUrl: @json(route('login')),
        csrf: @json(csrf_token()),
    };
</script>
