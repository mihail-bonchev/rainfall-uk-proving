from flask import Flask

def create_app():
    app = Flask(__name__)
    app.config['JSON_SORT_KEYS'] = False
    
    # Register blueprints
    from app.routes import main
    app.register_blueprint(main.bp)
    
    # Start development-only background poller for latest readings
    # This helps serve cached near-live values without stressing the remote API.
    try:
        from app.services.latest_service import start_background_poller
        # Start with a 60s interval. This will run in a daemon thread.
        start_background_poller(app, interval_seconds=60)
    except Exception:
        # If latest_service is not available or polling fails, continue without it.
        pass
    
    return app
