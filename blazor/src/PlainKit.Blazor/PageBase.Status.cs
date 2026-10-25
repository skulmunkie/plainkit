using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

public abstract partial class PageBase
{
    /// <summary>The page's status as one standard <see cref="PkAlert"/> (danger for a failed <see cref="OnLoadAsync"/>, which lands here through <see cref="SetErrorAsync"/>), or nothing while there is none. Write <c>@StatusContent</c> where the page shows it (#1772).</summary>
    protected RenderFragment StatusContent => b =>
    {
        if (StatusMessage is null) return;
        b.OpenComponent<PkAlert>(0);
        b.AddComponentParameter(1, nameof(PkAlert.Kind), StatusKind switch { "danger" => PkAlertKind.Error, "warning" => PkAlertKind.Warning, "success" => PkAlertKind.Success, _ => PkAlertKind.Info });
        b.AddComponentParameter(2, nameof(PkAlert.Title), StatusHeading);
        b.AddComponentParameter(3, nameof(PkAlert.Message), StatusMessage);
        b.CloseComponent();
    };
}
