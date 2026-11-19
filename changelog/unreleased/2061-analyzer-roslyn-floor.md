---
type: fixed
issue: 2061
---
The PKB001 analyzer in PlainKit.Blazor loads on every supported .NET SDK again: it references Roslyn 3.11 instead of 5.12 (0.33.0 and 0.34.0 failed with CS9057 on SDK 10.0.400, whose compiler is 5.9), and the package check fails when the packed analyzer references a newer Microsoft.CodeAnalysis than its project declares.
