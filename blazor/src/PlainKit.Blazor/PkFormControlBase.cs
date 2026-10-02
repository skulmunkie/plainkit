using System.Linq.Expressions;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;

namespace PlainKit.Blazor;

/// <summary>
/// The base of the generated form controls (a mapping whose <c>model</c> block has <c>"field": true</c>): the part of Blazor's <c>InputBase</c> that
/// ties a bound value to an <see cref="EditContext"/>. The generated <c>ValueExpression</c> (or <c>CheckedExpression</c>) names the field; the control
/// then marks it modified when the user changes it and shows the field's validation messages through the element's <c>invalid</c> state
/// (<c>&lt;ValidationMessage For="..."/&gt;</c> prints the text). Outside an <c>EditForm</c>, or without an expression, nothing of this applies.
/// </summary>
public abstract class PkFormControlBase<T> : PkElementBase, IDisposable
{
    private EditContext? _context;
    private FieldIdentifier _field;
    private Expression<Func<T>>? _expression;
    private bool _hasField;

    [CascadingParameter] private EditContext? CascadedEditContext { get; set; }

    /// <summary>The expression the generated component takes for the bound value.</summary>
    protected abstract Expression<Func<T>>? FieldExpression { get; }

    /// <summary>True when the bound field has validation messages in the surrounding <c>EditContext</c>.</summary>
    protected bool FieldInvalid => _hasField && _context!.GetValidationMessages(_field).Any();

    /// <summary>Tells the <c>EditContext</c> the bound field changed (marks it modified, runs field validation). Called after the bound value is set.</summary>
    protected void NotifyFieldChanged()
    {
        if (_hasField) _context!.NotifyFieldChanged(_field);
    }

    /// <inheritdoc />
    protected override void OnParametersSet()
    {
        base.OnParametersSet();
        var expression = FieldExpression;
        if (ReferenceEquals(expression, _expression) && ReferenceEquals(CascadedEditContext, _context)) return;
        if (!ReferenceEquals(CascadedEditContext, _context))
        {
            if (_context is not null) _context.OnValidationStateChanged -= OnValidationStateChanged;
            _context = CascadedEditContext;
            if (_context is not null) _context.OnValidationStateChanged += OnValidationStateChanged;
        }
        _expression = expression;
        _hasField = _context is not null && expression is not null;
        if (_hasField) _field = FieldIdentifier.Create(expression!);
    }

    private void OnValidationStateChanged(object? sender, ValidationStateChangedEventArgs e) => _ = InvokeAsync(StateHasChanged);

    /// <inheritdoc />
    public void Dispose()
    {
        if (_context is not null) _context.OnValidationStateChanged -= OnValidationStateChanged;
        GC.SuppressFinalize(this);
    }
}
