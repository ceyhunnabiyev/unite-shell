const Main           = imports.ui.main;
const Meta           = imports.gi.Meta;
const Shell          = imports.gi.Shell;
const Panel          = Main.panel;
const AppMenu        = Panel.statusArea.appMenu;
const St             = imports.gi.St;
const Gio            = imports.gi.Gio;
const GLib           = imports.gi.GLib;
const Lang           = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Unite          = ExtensionUtils.getCurrentExtension();
const Helpers        = Unite.imports.helpers;
const Convenience    = Unite.imports.convenience;
const MAXIMIZED      = Meta.MaximizeFlags.BOTH;

var WindowButtons = new Lang.Class({
  Name: 'Unite.WindowButtons',
  _wmHandlerIDs: [],
  _ovHandlerIDs: [],

  _init: function() {
    this._dwmprefs = Helpers.wmPreferences();
    this._settings = Convenience.getSettings();

    this._toggle();
    this._connectSettings();
  },

  _connectSettings: function() {
    this._settings.connect(
      'changed::show-window-buttons', Lang.bind(this, this._toggle)
    );

    this._settings.connect(
      'changed::window-buttons-theme', Lang.bind(this, this._updateTheme)
    );
  },

  _connectSignals: function () {
    this._dpHandlerID = this._dwmprefs.connect(
      'changed::button-layout', Lang.bind(this, this._updateButtons)
    );

    this._dsHandlerID = global.display.connect(
      'notify::focus-window', Lang.bind(this, this._updateVisibility)
    );

    ['showing', 'hiding'].forEach(Lang.bind(this, function (eventName) {
      this._ovHandlerIDs.push(Main.overview.connect(
        eventName, Lang.bind(this, this._updateVisibility)
      ));
    }));

    ['size-change', 'destroy'].forEach(Lang.bind(this, function (eventName) {
      this._wmHandlerIDs.push(global.window_manager.connect(
        eventName, Lang.bind(this, this._updateVisibility)
      ));
    }));
  },

  _disconnectSignals: function() {
    this._ovHandlerIDs = Helpers.overviewSignals(this._ovHandlerIDs);

    if (this._dpHandlerID) {
      this._dwmprefs.disconnect(this._dpHandlerID);
      delete this._dpHandlerID;
    }

    if (this._dsHandlerID) {
      global.display.disconnect(this._dsHandlerID);
      delete this._dsHandlerID;
    }

    this._ovHandlerIDs.forEach(function (handler) {
      Main.overview.disconnect(handler);
    });

    this._wmHandlerIDs.forEach(function (handler) {
      global.window_manager.disconnect(handler);
    });

    this._ovHandlerIDs = [];
    this._wmHandlerIDs = [];
  },

  _createButtons: function () {
    [this._position, this._buttons] = Helpers.getWindowButtons();

    if (this._buttons && !this._buttonsActor) {
      this._buttonsActor = new St.Bin();
      this._buttonsBox   = new St.BoxLayout({ style_class: 'window-buttons-box' });

      this._buttonsActor._windowButtons = true;

      this._buttonsActor.add_actor(this._buttonsBox);
      this._buttonsActor.hide();

      this._buttons.forEach(Lang.bind(this, function (action) {
        let button = new St.Button({ style_class: 'window-button ' + action, track_hover: true });
        let icon   = new St.Bin({ style_class: 'icon' });

        button._windowAction = action;
        button.add_actor(icon);
        button.connect('clicked', Lang.bind(this, this._onButtonClick));

        this._buttonsBox.add(button);
      }));

      if (this._position == 'left') {
        let appmenu = Main.panel.statusArea.appMenu.actor.get_parent();
        Panel._leftBox.insert_child_below(this._buttonsActor, appmenu);
      }

      if (this._position == 'right') {
        Panel._rightBox.add_child(this._buttonsActor);
      }
    }
  },

  _destroyButtons: function () {
    if (this._buttonsBox) {
      this._buttonsBox.destroy();
      delete this._buttonsBox;
    }

    if (this._buttonsActor) {
      this._buttonsActor.destroy();
      delete this._buttonsActor;
    }
  },

  _updateButtons: function () {
    if (this._buttonsActor) {
      this._destroyButtons();
      this._createButtons();
    }
  },

  _updateTheme: function () {
    this._unloadTheme();
    this._loadTheme();

    Main.loadTheme();
  },

  _loadTheme: function () {
    let context = St.ThemeContext.get_for_stage(global.stage).get_theme();
    let theme   = this._settings.get_string('window-buttons-theme');
    let cssPath = GLib.build_filenamev([Unite.path, 'themes', theme, 'stylesheet.css']);

    if (GLib.file_test(cssPath, GLib.FileTest.EXISTS)) {
      let cssFile = Gio.file_new_for_path(cssPath);

      if (!this._buttonsTheme || this._buttonsTheme !== cssFile) {
        this._buttonsTheme = cssFile;
        context.load_stylesheet(this._buttonsTheme);
      }
    }
  },

  _unloadTheme: function () {
    if (this._buttonsTheme) {
      let context = St.ThemeContext.get_for_stage(global.stage).get_theme();
      context.unload_stylesheet(this._buttonsTheme);
    }
  },

  _onButtonClick: function (actor, evt) {
    if (this._activeWindow) {
      switch (actor._windowAction) {
        case 'minimize':
          this._minimizeWindow();
          break;
        case 'maximize':
          this._maximizeWindow();
          break;
        case 'close':
          this._closeWindow();
          break;
      }
    }
  },

  _minimizeWindow: function () {
    if (!this._activeWindow.minimized) {
      this._activeWindow.minimize();
    }
  },

  _maximizeWindow: function () {
    if (this._activeWindow.get_maximized() === MAXIMIZED) {
      this._activeWindow.unmaximize(MAXIMIZED);
    } else {
      this._activeWindow.maximize(MAXIMIZED);
    }
  },

  _closeWindow: function () {
    this._activeWindow.delete(global.get_current_time());
  },

  _updateVisibility: function () {
    this._activeWindow = global.display.focus_window;

    if (this._buttonsActor) {
      let valid    = Helpers.isValidWindow(this._activeWindow);
      let overview = Main.overview.visibleTarget;
      let target   = AppMenu._targetApp;
      let running  = target != null && target.get_state() == Shell.AppState.RUNNING;
      let visible  = running && !overview;

      if (!overview && valid) {
        let maximized = Helpers.isMaximized(this._activeWindow, this._enabled);
        let always    = this._enabled == 'always' && this._activeWindow;

        visible = always || maximized;
      }

      if (visible) {
        this._buttonsActor.show();
      } else {
        this._buttonsActor.hide();
      }
    }
  },

  _toggle: function() {
    this._enabled = this._settings.get_string('show-window-buttons');
    this._enabled != 'never' ? this._activate() : this.destroy();
  },

  _activate: function() {
    if (!this._activated) {
      this._activated = true;

      this._createButtons();
      this._loadTheme();
      this._updateVisibility();
      this._connectSignals();
    }
  },

  destroy: function() {
    if (this._activated) {
      this._activated = false;

      this._destroyButtons();
      this._unloadTheme();
      this._disconnectSignals();

      delete this._buttonsTheme;
    }
  }
});
