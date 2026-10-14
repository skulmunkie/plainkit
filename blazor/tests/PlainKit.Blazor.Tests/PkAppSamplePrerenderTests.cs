using Microsoft.AspNetCore.Mvc.Testing;

namespace PlainKit.Blazor.Tests;

// #364 step 5/6: the sample host prerenders. The first response is real HTML from the server, rendered before any JS interop exists (no circuit yet), so the frame
// and the deep-linked page come back in the markup. The page elements draw their own h1 in their shadow tree on the client, so the markup carries the element and its config.
public sealed class PkAppSamplePrerenderTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _http;

    public PkAppSamplePrerenderTests(WebApplicationFactory<Program> factory) => _http = factory.CreateClient();

    private async Task<string> Get(string path)
    {
        var r = await _http.GetAsync(path);
        Assert.True(r.IsSuccessStatusCode, path + " answered " + (int)r.StatusCode);
        return await r.Content.ReadAsStringAsync();
    }

    [Fact]
    public async Task The_home_route_prerenders_the_frame()
    {
        var html = await Get("/overview");
        Assert.Contains("<pk-app-frame", html);
        Assert.Contains("brand=\"Demo app\"", html);
        Assert.Contains("<main id=\"pk-main\" tabindex=\"-1\">", html);
    }

    [Fact]
    public async Task A_deep_link_to_a_record_prerenders_the_record_and_its_nav_state()
    {
        var html = await Get("/orders/8");
        Assert.Contains("<pk-record-page", html);
        Assert.Contains("Order 8", html);
        Assert.Contains("current-id=\"all\"", html);
    }

    // A path no @page matches is re-run through the Razor app (status code pages): the first response keeps the 404 status and carries the frame and the not-found page.
    [Fact]
    public async Task An_unknown_route_answers_404_inside_the_frame()
    {
        var r = await _http.GetAsync("/orders/no/such/page");
        Assert.Equal(System.Net.HttpStatusCode.NotFound, r.StatusCode);
        var html = await r.Content.ReadAsStringAsync();
        Assert.Contains("<pk-app-frame", html);
        Assert.Contains("<pk-not-found-page", html);
    }

    [Fact]
    public async Task The_authorize_page_prerenders_the_refusal_not_the_page()
    {
        var r = await _http.GetAsync("/secure/audit");
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, r.StatusCode);
        var html = await r.Content.ReadAsStringAsync();
        Assert.Contains("Not allowed", html);
        Assert.DoesNotContain("Audit log", html);
    }
}
