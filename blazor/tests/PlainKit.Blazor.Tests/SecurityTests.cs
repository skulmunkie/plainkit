using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

/// <summary>Findings of the security audit (issue #106): the dev tools are off outside Development wherever they are mounted, the Files tab never lists credential files or follows links out of the source root, and a version string from the page cannot forge the log detail.</summary>
public sealed class SecurityTests : TestContext
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "app";
        public string ContentRootPath { get; set; } = "/x";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private BunitJSModuleInterop Register(string environment, bool? devTools)
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<IHostEnvironment>(new Env(environment));
        Services.AddPlainKit(o => o.DevTools = devTools);
        return bridge;
    }

    [Theory]
    [InlineData("Production", null, false)]
    [InlineData("Staging", null, false)]
    [InlineData("Development", null, true)]
    [InlineData("Production", true, true)]
    [InlineData("Development", false, false)]
    public void The_dev_tools_dock_mounts_only_where_the_page_would_be_served(string environment, bool? devTools, bool mounts)
    {
        var bridge = Register(environment, devTools);

        var cut = RenderComponent<PkDevTools>();

        Assert.Equal(mounts, bridge.Invocations.Any(i => i.Identifier == "mountDevTools"));
        Assert.Equal(mounts, cut.FindAll("div").Count == 1);
        if (!mounts) Assert.Empty(bridge.Invocations); // not even the bridge module is imported and started: nothing of the tools reaches the page
    }

    [Fact]
    public void The_dev_tools_page_is_off_in_production_by_default()
    {
        Register("Production", null);

        var cut = RenderComponent<PkDevToolsPage>();

        Assert.Contains("Dev tools are off", cut.Markup);
        Assert.Empty(cut.FindComponents<PkDevTools>());
    }

    [Fact]
    public void Splatted_attributes_cannot_carry_an_inline_event_handler_as_text_but_delegates_and_ordinary_attributes_pass()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        var clicks = 0;

        var cut = RenderComponent<PkBadge>(p => p
            .AddUnmatched("onclick", "alert(1)").AddUnmatched("onmouseover", "alert(2)").AddUnmatched("ONFOCUS", "alert(3)")
            .AddUnmatched("data-order", "42").AddUnmatched("aria-label", "Buy"));
        var el = cut.Find("pk-badge");

        Assert.Null(el.GetAttribute("onclick")); Assert.Null(el.GetAttribute("onmouseover")); Assert.Null(el.GetAttribute("onfocus"));
        Assert.Equal("42", el.GetAttribute("data-order")); Assert.Equal("Buy", el.GetAttribute("aria-label"));
        Assert.DoesNotContain("alert(", cut.Markup);

        // a real handler (a delegate) still works next to them
        var handled = RenderComponent<PkBadge>(p => p.AddUnmatched("onclick", Microsoft.AspNetCore.Components.EventCallback.Factory.Create<Microsoft.AspNetCore.Components.Web.MouseEventArgs>(this, () => clicks++)));
        handled.Find("pk-badge").Click();
        Assert.Equal(1, clicks);
    }

    [Theory]
    [InlineData("appsettings.json")]
    [InlineData("appsettings.Production.json")]
    [InlineData("appsettings.Development.json")]
    [InlineData("secrets.json")]
    [InlineData("Properties/launchSettings.json")]
    [InlineData("deploy.secrets.yml")]
    [InlineData("db-credentials.json")]
    [InlineData("api-token.yaml")]
    public void The_files_snapshot_never_lists_files_that_hold_credentials(string relative)
    {
        var root = Directory.CreateTempSubdirectory("pk-sensitive").FullName;
        try
        {
            var path = Path.Combine(root, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, "{\"ConnectionStrings\":{\"Default\":\"Server=db;Password=not-for-the-browser\"}}"); // secret-scan:allow (fixture)
            File.WriteAllText(Path.Combine(root, "Program.cs"), "class Program {}");

            var snapshot = PkSnapshot.FromDirectory(root);

            Assert.Equal(["Program.cs"], snapshot.Files.Select(f => f.Path));
            Assert.DoesNotContain("not-for-the-browser", JsonSerializer.Serialize(snapshot));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void The_files_snapshot_does_not_follow_a_link_out_of_the_source_root()
    {
        var outside = Directory.CreateTempSubdirectory("pk-outside").FullName;
        var root = Directory.CreateTempSubdirectory("pk-root").FullName;
        try
        {
            File.WriteAllText(Path.Combine(outside, "private.md"), "outside the root");
            try { Directory.CreateSymbolicLink(Path.Combine(root, "link"), outside); }
            catch (Exception e) when (e is UnauthorizedAccessException or IOException or PlatformNotSupportedException) { return; } // no privilege to make a link here: nothing to test
            File.WriteAllText(Path.Combine(root, "own.md"), "inside");

            var snapshot = PkSnapshot.FromDirectory(root);

            Assert.Equal(["own.md"], snapshot.Files.Select(f => f.Path));
        }
        finally { Directory.Delete(root, recursive: true); Directory.Delete(outside, recursive: true); }
    }

    [Fact]
    public async Task A_version_string_from_the_page_cannot_forge_the_log_detail()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        bridge.Setup<string>("version").SetResult("9.9.9\",\"package\":\"forged");
        var runtime = new PkRuntime(JSInterop.JSRuntime, new PkOptions(), LoggerFactory.Create(b => { }));

        await runtime.EnsureInitializedAsync();

        var detail = (string)bridge.Invocations["writeLog"].Single().Arguments[3]!;
        using var json = JsonDocument.Parse(detail); // it is valid JSON (a quote in the version did not break out of the string)...
        Assert.Equal(PkAssets.Version, json.RootElement.GetProperty("package").GetString()); // ...and the package field is still ours
        Assert.Equal("9.9.9\",\"package\":\"forged", json.RootElement.GetProperty("javascript").GetString());
    }
}
