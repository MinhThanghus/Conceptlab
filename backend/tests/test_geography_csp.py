from app.main import APP_CSP, MAPBOX_CONNECT
from app.services.widgets import WIDGET_CSP


def test_app_csp_allows_mapbox_after_spa_navigation_without_weakening_widget(client):
    # The SPA document policy is fixed at initial load, regardless of the later route.
    policies = [client.get(path).headers['content-security-policy'] for path in ('/', '/learn', '/learn/geography')]
    assert policies == [APP_CSP, APP_CSP, APP_CSP]
    assert "script-src 'self' 'wasm-unsafe-eval'" in APP_CSP
    assert "'unsafe-eval'" not in APP_CSP
    assert MAPBOX_CONNECT in APP_CSP
    assert 'https://api.mapbox.com/styles/v1/mapbox/' in APP_CSP
    assert 'https://api.mapbox.com/mapbox-gl-js/' in APP_CSP
    assert 'https://events.mapbox.com/' in APP_CSP
    assert "default-src 'none'" in WIDGET_CSP and 'mapbox.com' not in WIDGET_CSP
