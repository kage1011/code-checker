namespace PaymentService.Services;

public class PaymentService
{
    public Task<bool> ChargeAsync(decimal amount, CancellationToken ct)
    {
        return Task.FromResult(amount > 0);
    }
}
