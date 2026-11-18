using Microsoft.AspNetCore.Mvc;

namespace PaymentService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrderController : ControllerBase
{
    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout(OrderDto order)
    {
        // 1. Critical: Hardcoded connection string / secret
        var dbConn = "Server=10.0.0.5;Database=ProdDb;User Id=sa;Password=SuperSecret123!;";

        // 2. Critical: Sync-over-async .Result causes thread starvation & deadlock
        var paymentResult = ProcessPaymentAsync(order).Result;

        try
        {
            await SaveOrderToDb(order);
        }
        catch (Exception ex)
        {
            // 3. Warning: throw ex; clears call stack
            throw ex;
        }

        try
        {
            await NotifyCustomer(order);
        }
        catch (Exception)
        {
            // 4. Critical: Empty catch swallowed exception
        }

        return Ok(paymentResult);
    }

    private Task<string> ProcessPaymentAsync(OrderDto order) => Task.FromResult("SUCCESS");
    private Task SaveOrderToDb(OrderDto order) => Task.CompletedTask;
    private Task NotifyCustomer(OrderDto order) => Task.CompletedTask;
}

public class OrderDto
{
    public string? CustomerId { get; set; }
}
