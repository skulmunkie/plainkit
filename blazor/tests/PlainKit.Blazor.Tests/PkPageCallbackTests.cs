using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 366: PkToolPage.Run and PkSettingsPage.Save are the elements' run/save callback properties. The component hands the element a .NET
// reference through the bridge (setCallback); calling it runs the delegate with the element's values.
public sealed class PkPageCallbackTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkPageCallbackTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static Dictionary<string, JsonElement> Values(string json) => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void ToolPage_sends_config_and_label_and_sets_no_callback_without_Run()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Config, "{\"outcome\":\"text\"}").Add(x => x.RunLabel, "Count"));

        var el = cut.Find("pk-tool-page");
        Assert.Equal("{\"outcome\":\"text\"}", el.GetAttribute("config"));
        Assert.Equal("Count", el.GetAttribute("run-label"));
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task ToolPage_run_reaches_the_delegate_with_the_field_values_and_returns_its_result()
    {
        IReadOnlyDictionary<string, JsonElement>? seen = null;
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, v => { seen = v; return Task.FromResult<object?>(new { value = 3, label = "Words" }); }));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
        Assert.Equal("run", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"text\":\"a b c\",\"n\":2}")));

        Assert.Equal("a b c", seen!["text"].GetString());
        Assert.Equal(2, seen["n"].GetInt32());
        Assert.Equal(3, JsonSerializer.SerializeToElement(result).GetProperty("value").GetInt32());
    }

    [Fact]
    public async Task ToolPage_run_that_throws_faults_the_call_so_the_element_shows_its_error_state()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, _ => throw new InvalidOperationException("boom")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var e = Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{}"))));
        Assert.True(e.GetProperty("pkError").GetBoolean());
        Assert.Equal(Generic, e.GetProperty("message").GetString());
        Assert.Equal("System.InvalidOperationException", e.GetProperty("detail").GetString());   // the type name only: no text, frame or path leaves the server
        Assert.DoesNotContain("boom", e.GetRawText());
        Assert.DoesNotContain(" at ", e.GetRawText());
    }

    // #1599: PkRecordPage.IsUserFacing is PkRecordEditor.IsUserFacing for the Save (and Load) bridge: the marker or the predicate shows the message.
    private sealed class DomainRule(string message) : Exception(message);

    [Fact]
    public async Task RecordPage_IsUserFacing_lets_a_domain_exception_message_through_Save_and_only_that()
    {
        var cut = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())
            .Add(x => x.Save, _ => throw new DomainRule("Only one location can be primary."))
            .Add(x => x.IsUserFacing, ex => ex is DomainRule));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"], i => (string)i.Arguments[1]! == "save").Arguments[2]);
        Assert.Equal("Only one location can be primary.", Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{}")))).GetProperty("message").GetString());

        var other = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())
            .Add(x => x.Save, _ => throw new InvalidOperationException("internal detail"))
            .Add(x => x.IsUserFacing, ex => ex is DomainRule));
        var otherHost = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(_bridge.Invocations["setCallback"].Last(i => (string)i.Arguments[1]! == "save").Arguments[2]);
        var e = Envelope(await other.InvokeAsync(() => otherHost.Value.Invoke(Values("{}"))));
        Assert.Equal(Generic, e.GetProperty("message").GetString());
        Assert.DoesNotContain("internal detail", e.GetRawText());

        var throws = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())
            .Add(x => x.Save, _ => throw new DomainRule("x"))
            .Add(x => x.IsUserFacing, _ => throw new InvalidOperationException("predicate bug")));
        var throwsHost = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(_bridge.Invocations["setCallback"].Last(i => (string)i.Arguments[1]! == "save").Arguments[2]);
        Assert.Equal(Generic, Envelope(await throws.InvokeAsync(() => throwsHost.Value.Invoke(Values("{}")))).GetProperty("message").GetString());   // a predicate that throws counts as false

        var marked = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person()).Add(x => x.Save, _ => throw new Refusal("Marked.")));
        var markedHost = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(_bridge.Invocations["setCallback"].Last(i => (string)i.Arguments[1]! == "save").Arguments[2]);
        Assert.Equal("Marked.", Envelope(await marked.InvokeAsync(() => markedHost.Value.Invoke(Values("{}")))).GetProperty("message").GetString());   // the marker works without the predicate
    }

    [Fact]
    public void SettingsPage_SectionContent_renders_into_section_key_slots()   // #1604
    {
        var cut = Render<PkSettingsPage>(p => p.Add(x => x.SectionContent, new Dictionary<string, RenderFragment> { ["profile"] = b => b.AddMarkupContent(0, "<i id=\"mine\">x</i>") }));

        Assert.Equal("x", cut.Find("pk-settings-page [slot='section-profile'] #mine").TextContent);
    }

    [Fact]
    public void ToolPage_ChildContent_goes_in_the_default_slot()   // #1604
    {
        var cut = Render<PkToolPage>(p => p.AddChildContent("<b id=\"mine\">x</b>"));

        Assert.Equal("x", cut.Find("pk-tool-page #mine").TextContent);
    }

    private const string Generic = "Something went wrong. See the log for details.";
    private sealed class Refusal(string message) : Exception(message), IPkUserFacingException;
    private static JsonElement Envelope(object? result) => JsonSerializer.SerializeToElement(result);

    private sealed class Capture : ILoggerFactory, ILoggerProvider, ILogger
    {
        public readonly List<(LogLevel Level, string Text, Exception? Error)> Entries = [];
        public ILogger CreateLogger(string categoryName) => this;
        public void AddProvider(ILoggerProvider provider) { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => Entries.Add((logLevel, formatter(state, exception), exception));
        public void Dispose() { }
    }

    [Fact]
    public async Task The_full_exception_reaches_ILogger_on_the_server_while_the_envelope_has_neither_message_nor_stack()   // #1412
    {
        var capture = new Capture();
        Services.AddSingleton<ILoggerFactory>(capture);
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, v => v["who"].GetString() == "me" ? throw new Refusal("Only one location can be primary.") : throw new InvalidOperationException("secret detail")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var envelope = Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"who\":\"x\"}")))).GetRawText();
        Assert.DoesNotContain("secret detail", envelope);
        Assert.DoesNotContain(" at ", envelope);
        var error = Assert.Single(capture.Entries, e => e.Level == LogLevel.Error);
        Assert.Equal("secret detail", error.Error!.Message);
        Assert.Contains("PkPageCallbackTests", error.Error.StackTrace);

        await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"who\":\"me\"}")));
        Assert.Single(capture.Entries, e => e.Level == LogLevel.Error);   // the user-facing one is not an error
    }

    [Fact]
    public async Task A_user_facing_exception_keeps_its_message_and_any_other_text_stays_out_of_the_envelope()   // #1412
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, v => v["who"].GetString() == "me" ? throw new Refusal("Only one location can be primary.") : throw new InvalidOperationException("at Foo in C:\\src\\Secret.cs:line 9")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        Assert.Equal("Only one location can be primary.", Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"who\":\"me\"}")))).GetProperty("message").GetString());
        Assert.Equal(Generic, Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"who\":\"x\"}")))).GetProperty("message").GetString());
    }

    [Fact]
    public async Task ToolPage_clears_the_callback_when_Run_is_removed_and_releases_the_reference_on_dispose()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, _ => Task.FromResult<object?>("ok")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        cut.Render(p => p.Add<Func<IReadOnlyDictionary<string, JsonElement>, Task<object?>>?>(x => x.Run, null));
        Assert.Equal(2, _bridge.Invocations["setCallback"].Count);
        Assert.Null(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        Assert.Throws<ObjectDisposedException>(() => host.Value);

        // and once more set, then disposed with the component
        cut.Render(p => p.Add(x => x.Run, _ => Task.FromResult<object?>("ok")));
        var again = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => again.Value);
    }

    [Fact]
    public async Task SettingsPage_save_reaches_the_delegate_and_returns_nothing()
    {
        IReadOnlyDictionary<string, JsonElement>? saved = null;
        var cut = Render<PkSettingsPage>(p => p.Add(x => x.Values, "{\"density\":\"cozy\"}").Add(x => x.Save, v => { saved = v; return Task.CompletedTask; }));

        Assert.Equal("{\"density\":\"cozy\"}", cut.Find("pk-settings-page").GetAttribute("values"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("save", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"density\":\"compact\",\"beta\":true}")));

        Assert.Null(result);
        Assert.Equal("compact", saved!["density"].GetString());
        Assert.True(saved["beta"].GetBoolean());
    }

    [Fact]
    public async Task SettingsPage_bind_Values_follows_the_saved_values_after_a_successful_save_only()
    {
        var bound = "{\"density\":\"cozy\"}"; var fail = false;
        var cut = Render<PkSettingsPage>(p => p.Add(x => x.Values, bound)
            .Add(x => x.ValuesChanged, EventCallback.Factory.Create<string?>(this, v => bound = v!))
            .Add(x => x.Save, v => fail ? throw new InvalidOperationException("no") : Task.CompletedTask));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        fail = true;
        Assert.True(Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"density\":\"x\"}")))).GetProperty("pkError").GetBoolean());
        Assert.Equal("{\"density\":\"cozy\"}", bound);

        fail = false;
        await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"density\":\"compact\"}")));
        Assert.Equal("{\"density\":\"compact\"}", bound);
        Assert.Equal(bound, cut.Instance.Values);
    }

    [Fact]
    public async Task WizardPage_submit_reaches_the_delegate_and_its_result_goes_back_and_events_are_raised()
    {
        IReadOnlyDictionary<string, JsonElement>? sent = null; string? action = null; bool? dirty = null; var submitted = 0;
        var cut = Render<PkWizardPage>(p => p
            .Add(x => x.Submit, v => { sent = v; return Task.FromResult<object?>(new { errors = new { email = "Taken" } }); })
            .Add(x => x.OnAction, EventCallback.Factory.Create<PkActionEventArgs>(this, e => action = e.Key))
            .Add(x => x.OnDirty, EventCallback.Factory.Create<PkWizardDirtyEventArgs>(this, e => dirty = e.Dirty))
            .Add(x => x.OnSubmit, EventCallback.Factory.Create(this, () => submitted++)));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("submit", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"email\":\"a@b.c\"}")));
        Assert.Equal("a@b.c", sent!["email"].GetString());
        Assert.NotNull(result?.GetType().GetProperty("errors"));   // the { errors } object goes back to the element as is

        var el = cut.Find("pk-wizard-page");
        await el.TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "help" });
        await el.TriggerEventAsync("onpk-wizard-dirty", new PkWizardDirtyEventArgs { Dirty = true });
        await el.TriggerEventAsync("onpk-wizard-submit", new EventArgs());
        Assert.Equal("help", action);
        Assert.True(dirty);
        Assert.Equal(1, submitted);
    }

    [Fact]
    public async Task WizardPage_Validate_gets_the_step_id_and_values_from_one_object_and_Load_asks_the_element_to_start_again()
    {
        string? step = null; IReadOnlyDictionary<string, JsonElement>? seen = null;
        Render<PkWizardPage>(p => p
            .Add(x => x.Validate, (s, v) => { step = s; seen = v; return Task.FromResult<object?>(null); })
            .Add(x => x.Load, () => Task.FromResult<IReadOnlyDictionary<string, object?>>(new Dictionary<string, object?> { ["email"] = "a@b.c" })));

        var calls = _bridge.Invocations["setCallback"].ToDictionary(i => (string)i.Arguments[1]!);
        Assert.Equal(new[] { "stepId", "values" }, (string[])calls["validate"].Arguments[4]!);
        Assert.Equal(false, calls["validate"].Arguments[3]);
        Assert.Equal(true, calls["load"].Arguments[3]);   // refresh: the wizard drew before load was set
        Assert.Null(calls["load"].Arguments[4]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(calls["validate"].Arguments[2]);
        var result = await host.Value.Invoke(Values("{\"stepId\":\"account\",\"values\":{\"email\":\"x@y.z\"}}"));
        Assert.Null(result);
        Assert.Equal("account", step);
        Assert.Equal("x@y.z", seen!["email"].GetString());
    }

    [Fact]
    public async Task RecordPage_and_pages_with_a_title_bar_raise_OnAction_OnDirty_OnSave_and_TitleContent_fills_the_title_slot()
    {
        string? action = null; bool? dirty = null; var saved = 0;
        var cut = Render<PkRecordPage<Person>>(p => p
            .Add(x => x.OnAction, EventCallback.Factory.Create<PkActionEventArgs>(this, e => action = e.Key))
            .Add(x => x.OnDirty, EventCallback.Factory.Create<PkRecordDirtyEventArgs>(this, e => dirty = e.Dirty))
            .Add(x => x.OnSave, EventCallback.Factory.Create(this, () => saved++)));
        var el = cut.Find("pk-record-page");
        await el.TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "print" });
        await el.TriggerEventAsync("onpk-record-dirty", new PkRecordDirtyEventArgs { Dirty = true });
        await el.TriggerEventAsync("onpk-record-save", new EventArgs());
        Assert.Equal("print", action);
        Assert.True(dirty);
        Assert.Equal(1, saved);

        var dash = Render<PkDashboardPage>(p => p.Add(x => x.OnAction, EventCallback.Factory.Create<PkActionEventArgs>(this, e => action = e.Key)));
        await dash.Find("pk-dashboard-page").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "refresh" });
        Assert.Equal("refresh", action);

        var tool = Render<PkToolPage>(p => p.Add(x => x.TitleContent, "<h1>Counter</h1>"));
        Assert.Contains("slot=\"title\"", tool.Markup);
    }

    private sealed class Person { public string Name { get; set; } = ""; public int Age { get; set; } public bool Active { get; set; } }

    private static readonly IReadOnlyList<PkFieldSpec<Person>> PersonFields =
    [
        new() { Key = "name", Label = "Name", Required = true, Get = p => p.Name, Set = (p, v) => p.Name = v ?? "" },
        new() { Key = "age", Label = "Age", Kind = PkFieldKind.Number, Get = p => p.Age.ToString(), Set = (p, v) => p.Age = int.Parse(v ?? "0") },
        PkFieldSpec<Person>.Bool("active", "Active", p => p.Active, (p, v) => p.Active = v),
    ];

    [Fact]
    public void RecordPage_view_templates_fill_the_field_value_slots()
    {
        var cut = Render<PkRecordPage<Person>>(p => p.Add(x => x.ViewFields, new Dictionary<string, RenderFragment> { ["status"] = b => b.AddContent(0, "Shipped") }));

        Assert.Equal("Shipped", cut.Find("[slot=field-status]").TextContent);
    }

    [Fact]
    public void RecordPage_sends_the_specs_as_config_fields_and_a_new_records_model_as_its_values()
    {
        var cut = Render<PkRecordPage<Person>>(p => p
            .Add(x => x.Config, "{\"heading\":\"Person\"}")
            .Add(x => x.Fields, PersonFields)
            .Add(x => x.Model, new Person { Name = "Ada", Age = 36, Active = true }));

        var config = JsonDocument.Parse(cut.Find("pk-record-page").GetAttribute("config")!).RootElement;
        Assert.Equal("Person", config.GetProperty("heading").GetString());
        Assert.Equal(["name", "age", "active"], config.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()));
        Assert.Equal("number", config.GetProperty("fields")[1].GetProperty("kind").GetString());
        var values = config.GetProperty("values");
        Assert.Equal("Ada", values.GetProperty("name").GetString());
        Assert.Equal("36", values.GetProperty("age").GetString());
        Assert.True(values.GetProperty("active").GetBoolean());

        var withId = Render<PkRecordPage<Person>>(p => p.Add(x => x.Config, "{\"id\":\"7\"}").Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person()));
        Assert.False(JsonDocument.Parse(withId.Find("pk-record-page").GetAttribute("config")!).RootElement.TryGetProperty("values", out _));
    }

    [Fact]
    public void RecordPage_sends_Sections_Sidebar_and_the_title_TitleOf_gives_the_loaded_or_new_record()
    {
        var cut = Render<PkRecordPage<Person>>(p => p
            .Add(x => x.Config, "{\"title\":\"Person\",\"sidebar\":[{\"heading\":\"Old\",\"fields\":[\"age\"]}]}")
            .Add(x => x.Fields, PersonFields)
            .Add(x => x.Model, new Person { Name = "Ada" })
            .Add(x => x.Sections, [new PkRecordSection("Main", ["name"])])
            .Add(x => x.Sidebar, [new PkRecordSection("Status", ["active"])])
            .Add(x => x.TitleOf, person => person.Name));

        var config = JsonDocument.Parse(cut.Find("pk-record-page").GetAttribute("config")!).RootElement;
        Assert.Equal("Ada", config.GetProperty("title").GetString());
        Assert.Equal("Main", config.GetProperty("sections")[0].GetProperty("heading").GetString());
        Assert.Equal(["name"], config.GetProperty("sections")[0].GetProperty("fields").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal("Status", config.GetProperty("sidebar")[0].GetProperty("heading").GetString());
        Assert.Equal(1, config.GetProperty("sidebar").GetArrayLength());

        var untitled = Render<PkRecordPage<Person>>(p => p.Add(x => x.Config, "{\"title\":\"Person\"}").Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person()).Add(x => x.TitleOf, person => person.Name));
        Assert.Equal("Person", JsonDocument.Parse(untitled.Find("pk-record-page").GetAttribute("config")!).RootElement.GetProperty("title").GetString());
    }

    [Fact]
    public async Task RecordPage_OnCancel_shows_Cancel_on_a_new_record_and_raises_with_the_id()
    {
        PkRecordCancelEventArgs? seen = null;
        var cut = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())
            .Add(x => x.OnCancel, EventCallback.Factory.Create<PkRecordCancelEventArgs>(this, e => seen = e)));
        Assert.True(cut.Find("pk-record-page").HasAttribute("cancellable"));
        await cut.Find("pk-record-page").TriggerEventAsync("onpk-record-cancel", new PkRecordCancelEventArgs { Id = "7" });
        Assert.Equal("7", seen?.Id);
        Assert.False(Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())).Find("pk-record-page").HasAttribute("cancellable"));
    }

    [Fact]
    public void RecordPage_spec_Editor_is_the_custom_fields_body_slot_and_gets_the_model()
    {
        IReadOnlyList<PkFieldSpec<Person>> fields =
        [
            new() { Key = "name", Label = "Name", Get = p => p.Name, Set = (p, v) => p.Name = v ?? "" },
            new() { Key = "tags", Label = "Tags", Get = _ => "", Set = (_, _) => { }, Editor = p => b => b.AddContent(0, "Edit " + p.Name) },
        ];
        var cut = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, fields).Add(x => x.Model, new Person { Name = "Ada" }));

        Assert.Equal("Edit Ada", cut.Find("[slot=editor-tags]").TextContent);
        Assert.Empty(cut.FindAll("[slot=editor-name]"));
        var config = JsonDocument.Parse(cut.Find("pk-record-page").GetAttribute("config")!).RootElement;
        Assert.Equal("custom", config.GetProperty("fields")[1].GetProperty("kind").GetString());
    }

    [Fact]
    public async Task RecordPage_OnDelete_shows_Delete_and_Busy_and_Error_reach_the_element()
    {
        string? deleted = null;
        var plain = Render<PkRecordPage<Person>>();
        Assert.False(plain.Find("pk-record-page").HasAttribute("deletable"));

        var cut = Render<PkRecordPage<Person>>(p => p
            .Add(x => x.OnDelete, EventCallback.Factory.Create<PkRecordDeleteEventArgs>(this, e => deleted = e.Id))
            .Add(x => x.Busy, true)
            .Add(x => x.Error, "Could not delete."));
        var el = cut.Find("pk-record-page");
        Assert.True(el.HasAttribute("deletable"));
        Assert.True(el.HasAttribute("busy"));
        Assert.Equal("Could not delete.", el.GetAttribute("error"));

        await el.TriggerEventAsync("onpk-record-delete", new PkRecordDeleteEventArgs { Id = "7" });
        Assert.Equal("7", deleted);
    }

    [Fact]
    public async Task RecordPage_IsUserFacing_applies_to_a_BeforeSave_that_throws()
    {
        var cut = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())
            .Add(x => x.BeforeSave, _ => throw new DomainRule("Collides with order 4."))
            .Add(x => x.IsUserFacing, ex => ex is DomainRule));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"], i => (string)i.Arguments[1]! == "beforeSave").Arguments[2]);
        Assert.Equal("Collides with order 4.", Envelope(await cut.InvokeAsync(() => host.Value.Invoke(Values("{}")))).GetProperty("message").GetString());
    }

    [Fact]
    public async Task RecordPage_BeforeSave_gets_the_item_with_the_form_applied_and_its_answer_goes_back_to_the_element()
    {
        Person? seen = null; var go = false;
        var cut = Render<PkRecordPage<Person>>(p => p.Add(x => x.Fields, PersonFields).Add(x => x.Model, new Person())
            .Add(x => x.BeforeSave, person => { seen = person; return Task.FromResult(go); })
            .Add(x => x.Save, _ => Task.CompletedTask));
        var call = Assert.Single(_bridge.Invocations["setCallback"], i => (string)i.Arguments[1]! == "beforeSave");
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(call.Arguments[2]);

        Assert.Equal(false, await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"name\":\"Bo\",\"age\":41}"))));
        Assert.Equal("Bo", seen!.Name);
        Assert.Equal(41, seen.Age);
        go = true;
        Assert.Equal(true, await cut.InvokeAsync(() => host.Value.Invoke(Values("{}"))));
    }

    [Fact]
    public async Task RecordPage_load_gets_the_id_answers_the_values_and_save_gets_the_item_with_the_form_applied()
    {
        string? loadedId = null; Person? saved = null; var loaded = new Person { Name = "Ada", Age = 36 };
        var cut = Render<PkRecordPage<Person>>(p => p
            .Add(x => x.Config, "{\"id\":\"o-7\"}")
            .Add(x => x.Fields, PersonFields)
            .Add(x => x.Load, id => { loadedId = id; return Task.FromResult<Person?>(loaded); })
            .Add(x => x.Save, v => { saved = v; return Task.CompletedTask; }));

        var calls = _bridge.Invocations["setCallback"].ToList();
        Assert.Equal(["load", "save"], calls.Select(c => c.Arguments[1]));
        Assert.All(calls, c => Assert.Equal(true, c.Arguments[3]));   // the page connected before the callbacks existed: it loads again
        var load = Assert.IsType<DotNetObjectReference<PkCallbackHost<JsonElement>>>(calls[0].Arguments[2]);
        var asText = await cut.InvokeAsync(() => load.Value.Invoke(JsonDocument.Parse("\"o-7\"").RootElement));
        Assert.Equal("o-7", loadedId);
        var values = JsonSerializer.SerializeToElement(asText);
        Assert.Equal("Ada", values.GetProperty("name").GetString());
        Assert.Equal("36", values.GetProperty("age").GetString());
        await cut.InvokeAsync(() => load.Value.Invoke(JsonDocument.Parse("42").RootElement));
        Assert.Equal("42", loadedId);

        var save = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(calls[1].Arguments[2]);
        Assert.Null(await cut.InvokeAsync(() => save.Value.Invoke(Values("{\"name\":\"Bo\",\"age\":41,\"active\":true}"))));
        Assert.Same(loaded, saved);
        Assert.Equal("Bo", saved!.Name);
        Assert.Equal(41, saved.Age);
        Assert.True(saved.Active);
    }

    [Fact]
    public async Task ListPage_OnRowClick_makes_rows_clickable_and_receives_the_row()
    {
        PkRowClickEventArgs? clicked = null;
        var without = Render<PkListPage<Order>>();
        Assert.False(without.Find("pk-list-page").HasAttribute("clickable"));

        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.OnRowClick, e => { clicked = e; }));
        Assert.True(cut.Find("pk-list-page").HasAttribute("clickable"));
        await cut.Find("pk-list-page").TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "A-1", Row = JsonDocument.Parse("{\"orderNo\":\"A-1\"}").RootElement.Clone() });

        Assert.Equal("A-1", clicked!.Id);
        Assert.Equal("A-1", clicked.Row!.Value.GetProperty("orderNo").GetString());
    }

    [Fact]
    public async Task ListPage_Cells_fill_the_cell_slots_of_the_loaded_rows()
    {
        var cut = Render<PkListPage<Order>>(p => p
            .Add(x => x.Load, r => Task.FromResult(new PkListResult<Order>([new("A-1", 5), new("B-2", 7)], 2)))
            .Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.Cells, new Dictionary<string, RenderFragment<Order>> { ["total"] = o => b => b.AddContent(0, $"EUR {o.Total}") }));
        Assert.Empty(cut.FindAll("[slot^='cell-']"));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery()));

        Assert.Equal(["cell-A-1-total", "cell-B-2-total"], cut.FindAll("[slot^='cell-']").Select(e => e.GetAttribute("slot")));
        Assert.Equal("EUR 7", cut.Find("[slot='cell-B-2-total']").TextContent);
    }

    [Fact]
    public async Task ListPage_typed_Columns_replace_config_columns_and_Cell_fills_slots()
    {
        var cut = Render<PkListPage<Order>>(p => p
            .Add(x => x.Config, "{\"label\":\"Orders\",\"columns\":[{\"key\":\"old\",\"label\":\"Old\"}]}")
            .Add(x => x.Columns, [new() { Key = "orderNo", Label = "No", Sortable = true }, new() { Key = "total", Label = "Total", Cell = o => b => b.AddContent(0, $"EUR {o.Total}") }])
            .Add(x => x.Load, r => Task.FromResult(new PkListResult<Order>([new("A-1", 5)], 1)))
            .Add(x => x.IdOf, o => o.OrderNo));
        var config = JsonDocument.Parse(cut.Find("pk-list-page").GetAttribute("config")!).RootElement;
        Assert.Equal("Orders", config.GetProperty("label").GetString());
        Assert.Equal(["orderNo", "total"], config.GetProperty("columns").EnumerateArray().Select(c => c.GetProperty("key").GetString()));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery()));

        Assert.Equal(["cell-A-1-total"], cut.FindAll("[slot^='cell-']").Select(e => e.GetAttribute("slot")));
        Assert.Equal("EUR 5", cut.Find("[slot='cell-A-1-total']").TextContent);
    }

    private sealed record Order(string OrderNo, int Total);

    [Fact]
    public void ListPage_Load_with_Columns_IdOf_and_RowHrefTemplate_asks_the_element_to_load_on_first_render()
    {
        // #1364: the element drew its empty state before the bridge set Load, so setCallback must ask it to refresh (the load runs without a typed search).
        Render<PkListPage<Order>>(p => p
            .Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }])
            .Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.RowHrefTemplate, "/orders/{id}")
            .Add(x => x.Load, r => Task.FromResult(new PkListResult<Order>([new("A-1", 5)], 1))));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("load", call.Arguments[1]);
        Assert.Equal(true, call.Arguments[3]);
    }

    [Fact]
    public async Task ListPage_load_gets_the_query_as_a_request_and_returns_rows_and_total()
    {
        PkListRequest? seen = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Config, "{\"columns\":[{\"key\":\"orderNo\",\"label\":\"No\"}]}")
            .Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([new("A-1", 5)], 41)); }));

        Assert.Contains("orderNo", cut.Find("pk-list-page").GetAttribute("config"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("load", call.Arguments[1]);
        Assert.Equal(true, call.Arguments[3]);   // a list that drew its empty state before the callback existed redraws (or, not yet defined, loads when it upgrades)
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(call.Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"page\":3,\"pageSize\":10,\"sort\":\"total\",\"sortDir\":\"descending\",\"search\":\" ab \",\"filters\":{\"status\":\"open\"}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var result = await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal(new PkListRequest("ab", "total", true, 3, 10), seen! with { Filters = null });
        Assert.Equal("open", seen.Filters!["status"]);
        Assert.Equal(20, seen.Skip);
        var json = JsonSerializer.SerializeToElement(result);
        Assert.Equal(41, json.GetProperty("total").GetInt32());
        Assert.Equal("A-1", json.GetProperty("rows")[0].GetProperty("OrderNo").GetString());
    }

    [Fact]
    public async Task ListPage_load_gets_a_multiselect_filter_as_a_list_and_a_text_filter_as_text()
    {
        PkListRequest? seen = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"status\":\"open\",\"region\":[\"north\",\"south\"],\"none\":[]}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal("open", Assert.Single(seen!.Filters!).Value);
        Assert.Equal(["north", "south"], seen.MultiFilters!["region"]);
        Assert.Empty(seen.MultiFilters["none"]);
    }

    [Fact]
    public async Task DataTable_load_gets_a_multiselect_filter_in_MultiFilters_and_a_text_filter_in_Filters()
    {
        PkListRequest? seen = null;
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"status\":[\"open\",\"paused\"],\"owner\":\"ada\",\"status\":\"closed\"}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal("ada", seen!.Filters!["owner"]);
        Assert.Equal("closed", seen.Filters["status"]);   // a key sent twice: the last value wins (JSON object), so it is in one dictionary only
        Assert.Null(seen.MultiFilters);
    }

    [Fact]
    public async Task DataTable_load_gets_an_array_filter_as_a_list()
    {
        PkListRequest? seen = null;
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"status\":[\"open\",\"paused\"],\"owner\":\"ada\"}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal("ada", seen!.Filters!["owner"]);
        Assert.Equal(["open", "paused"], seen.MultiFilters!["status"]);
    }

    [Fact]
    public void A_query_with_only_array_filters_has_no_text_Filters()
    {
        var request = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"tag\":[\"a\"]}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!.ToRequest();

        Assert.Null(request.Filters);
        Assert.Equal(["a"], request.MultiFilters!["tag"]);
    }

    [Fact]
    public async Task ListPage_default_query_is_page_one_with_no_search_sort_or_filters()
    {
        PkListRequest? seen = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery(Sort: "", Search: "  ")));

        Assert.Null(seen!.Search);
        Assert.Null(seen.SortKey);
        Assert.False(seen.Descending);
        Assert.Equal(1, seen.Page);
        Assert.Null(seen.Filters);
    }

    [Fact]
    public void ListPage_sets_no_callback_without_Load()
    {
        Render<PkListPage<Order>>();
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task ListPage_load_that_throws_faults_the_call_so_the_element_shows_its_error_state()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, _ => throw new InvalidOperationException("db down")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var e = Envelope(await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery())));
        Assert.Equal(Generic, e.GetProperty("message").GetString());
        Assert.DoesNotContain("db down", e.GetRawText());
    }

    [Fact]
    public async Task ListPage_clears_the_callback_when_Load_is_removed_and_releases_the_reference_on_dispose()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, _ => Task.FromResult(new PkListResult<Order>([], 0))));
        var first = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        cut.Render(p => p.Add<Func<PkListRequest, Task<PkListResult<Order>>>?>(x => x.Load, null));
        Assert.Null(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        Assert.Throws<ObjectDisposedException>(() => first.Value);

        cut.Render(p => p.Add(x => x.Load, _ => Task.FromResult(new PkListResult<Order>([], 0))));
        var again = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => again.Value);
    }

    [Fact]
    public async Task DashboardPage_load_gets_the_widget_key_and_returns_what_the_widget_draws()
    {
        string? key = null;
        var cut = Render<PkDashboardPage>(p => p.Add(x => x.Load, k => { key = k; return Task.FromResult<object?>(new { value = 12 }); }));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("load", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke("revenue"));

        Assert.Equal("revenue", key);
        Assert.Equal(12, JsonSerializer.SerializeToElement(result).GetProperty("value").GetInt32());
    }

    [Fact]
    public async Task DashboardPage_load_that_throws_faults_only_that_call()
    {
        var cut = Render<PkDashboardPage>(p => p.Add(x => x.Load, k => k == "bad" ? throw new InvalidOperationException("no data") : Task.FromResult<object?>("ok")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        Assert.True(Envelope(await cut.InvokeAsync(() => host.Value.Invoke("bad"))).GetProperty("pkError").GetBoolean());
        Assert.Equal("ok", await cut.InvokeAsync(() => host.Value.Invoke("good")));
    }

    [Fact]
    public async Task DocPage_OnNavigate_carries_id_anchor_and_replace()
    {
        PkNavigateEventArgs? got = null;
        var cut = Render<PkDocPage>(p => p.Add(x => x.OnNavigate, EventCallback.Factory.Create<PkNavigateEventArgs>(this, e => got = e)));
        await cut.Find("pk-doc-page").TriggerEventAsync("onpk-navigate", new PkNavigateEventArgs { Id = "intro", Anchor = "setup", Replace = false });
        Assert.Equal("intro", got?.Id);
        Assert.Equal("setup", got?.Anchor);
        Assert.False(got?.Replace);
    }
    [Fact]
    public async Task DocPage_loadItem_gets_the_id_and_null_means_not_found()
    {
        string? id = null;
        var cut = Render<PkDocPage>(p => p.Add(x => x.LoadItem, i => { id = i; return Task.FromResult<object?>(i == "gone" ? null : new { title = "Intro", html = "<p>Hi</p>" }); }));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("loadItem", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string>>>(call.Arguments[2]);
        var item = await cut.InvokeAsync(() => host.Value.Invoke("intro"));
        Assert.Equal("intro", id);
        Assert.Equal("Intro", JsonSerializer.SerializeToElement(item).GetProperty("title").GetString());
        Assert.Null(await cut.InvokeAsync(() => host.Value.Invoke("gone")));
    }

    [Fact]
    public async Task DocPage_and_DashboardPage_set_no_callback_without_a_delegate_and_release_it_on_dispose()
    {
        Render<PkDocPage>();
        Render<PkDashboardPage>();
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");

        var cut = Render<PkDocPage>(p => p.Add(x => x.LoadItem, _ => Task.FromResult<object?>(null)));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => host.Value);
    }

    // #1415: a pane lives in the element's shadow tree, so the Blazor panes are slots Blazor renders as light-DOM children of the page element.
    [Fact]
    public void WorkspacePage_NavContent_ChildContent_and_AsideContent_fill_the_nav_default_and_aside_slots()
    {
        var cut = Render<PkWorkspacePage>(p => p
            .Add(x => x.NavContent, "<ul>Files</ul>").Add(x => x.ChildContent, "<p>Editor</p>").Add(x => x.AsideContent, "<p>Outline</p>"));

        Assert.Equal("Files", cut.Find("pk-workspace-page > [slot=nav]").TextContent);
        Assert.Equal("Outline", cut.Find("pk-workspace-page > [slot=aside]").TextContent);
        Assert.Contains("Editor", cut.Find("pk-workspace-page").InnerHtml);
    }

    [Fact]
    public void WizardPage_ChildContent_carries_the_apps_own_step_elements_and_MasterDetail_DetailContent_the_record()
    {
        var wizard = Render<PkWizardPage>(p => p.Add(x => x.ChildContent, "<div slot=\"step-intro\">Welcome</div>"));
        Assert.Equal("Welcome", wizard.Find("pk-wizard-page > [slot=step-intro]").TextContent);

        var md = Render<PkMasterDetailPage>(p => p.Add(x => x.RecordId, "7").Add(x => x.DetailContent, "<p>Record 7</p>"));
        Assert.Contains("Record 7", md.Find("pk-master-detail-page").InnerHtml);
    }

    [Fact]
    public async Task MasterDetailPage_Load_gets_the_query_and_asks_the_element_to_redraw_and_Close_runs_without_arguments()
    {
        JsonElement? query = null; var closed = 0;
        var cut = Render<PkMasterDetailPage>(p => p
            .Add(x => x.Load, q => { query = q; return Task.FromResult<object?>(new { rows = Array.Empty<object>(), total = 0 }); })
            .Add(x => x.Close, () => { closed++; return Task.CompletedTask; }));

        var calls = _bridge.Invocations["setCallback"].ToDictionary(i => (string)i.Arguments[1]!);
        Assert.Equal(true, calls["load"].Arguments[3]);   // the list drew before load was set
        var load = Assert.IsType<DotNetObjectReference<PkCallbackHost<JsonElement>>>(calls["load"].Arguments[2]);
        Assert.Equal(0, JsonSerializer.SerializeToElement(await cut.InvokeAsync(() => load.Value.Invoke(JsonDocument.Parse("{\"page\":2}").RootElement))).GetProperty("total").GetInt32());
        Assert.Equal(2, query!.Value.GetProperty("page").GetInt32());
        var close = Assert.IsType<DotNetObjectReference<PkCallbackHost<JsonElement>>>(calls["close"].Arguments[2]);
        Assert.Null(await cut.InvokeAsync(() => close.Value.Invoke(default)));
        Assert.Equal(1, closed);
    }

    [Fact]
    public async Task ListPage_passes_selection_and_bulk_actions_to_OnSelect_and_OnBulk()
    {
        PkSelectEventArgs? selected = null; PkBulkEventArgs? bulk = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Config, "{\"selectable\":true,\"bulkActions\":[{\"id\":\"archive\",\"label\":\"Archive\"}]}")
            .Add(x => x.OnSelect, e => { selected = e; })
            .Add(x => x.OnBulk, e => { bulk = e; }));
        var query = JsonDocument.Parse("{\"page\":2,\"pageSize\":10,\"search\":\"ab\"}").RootElement.Clone();

        await cut.Find("pk-list-page").TriggerEventAsync("onpk-select", new PkSelectEventArgs { Selected = ["A-1", "A-2"], Scope = "all", Query = query });
        await cut.Find("pk-list-page").TriggerEventAsync("onpk-bulk", new PkBulkEventArgs { Action = "archive", Selected = ["A-1"], Scope = "page", Query = query });

        Assert.Equal(["A-1", "A-2"], selected!.Selected!);
        Assert.Equal("all", selected.Scope);
        Assert.Equal("ab", selected.ToRequest()!.Search);
        Assert.Equal("archive", bulk!.Action);
        Assert.Equal(["A-1"], bulk.Selected!);
    }
}
