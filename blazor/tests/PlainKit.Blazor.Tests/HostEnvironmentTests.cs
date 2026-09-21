using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace PlainKit.Blazor.Tests;

// Issue #76: PlainKit.Blazor must load in a Blazor WebAssembly app, which has neither IHostEnvironment (Microsoft.Extensions.Hosting.Abstractions) nor a
// content root. The host is therefore read through PkHostEnvironment, never through a constructor or a component that names the server's types.
public class HostEnvironmentTests
{
    private sealed class Env(string name, string root) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "app";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IServiceProvider Services(IHostEnvironment? env)
    {
        var services = new ServiceCollection();
        if (env is not null) services.AddSingleton(env);
        return services.BuildServiceProvider();
    }

    [Fact]
    public void Development_is_read_from_the_server_host_environment()
    {
        Assert.True(PkHostEnvironment.IsDevelopment(Services(new Env("Development", "/x"))));
        Assert.False(PkHostEnvironment.IsDevelopment(Services(new Env("Production", "/x"))));
    }

    [Fact]
    public void A_host_without_an_environment_is_not_development_and_has_no_content_root()
    {
        Assert.False(PkHostEnvironment.IsDevelopment(Services(null)));
        Assert.Null(PkHostEnvironment.ContentRoot(Services(null)));
        Assert.Null(PkHostEnvironment.ContentRoot(null));
    }

    [Fact]
    public async Task The_source_provider_browses_the_content_root_and_needs_no_host_environment_type_in_its_constructor()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pk-src-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            File.WriteAllText(Path.Combine(dir, "a.md"), "hello");
            var snapshot = await new PkSourceProvider(new PkOptions(), Services(new Env("Development", dir))).GetAsync();
            Assert.Contains(snapshot!.Files, f => f.Path == "a.md");

            Assert.Null(await new PkSourceProvider(new PkOptions(), Services(null)).GetAsync());
            var explicitRoot = await new PkSourceProvider(new PkOptions { SourceRoot = dir }).GetAsync();
            Assert.NotNull(explicitRoot);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void The_source_provider_constructor_mentions_no_hosting_type()
    {
        // A constructor parameter of a type from an assembly the browser does not ship makes the service container throw there.
        foreach (var parameter in typeof(PkSourceProvider).GetConstructors().SelectMany(c => c.GetParameters()))
            Assert.DoesNotContain("Hosting", parameter.ParameterType.Namespace ?? "");
    }
}
