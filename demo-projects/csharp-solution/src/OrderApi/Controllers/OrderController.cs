using Microsoft.AspNetCore.Mvc;

namespace OrderApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrderController : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> CreateOrder()
    {
        // Critical: .Result causes deadlock
        var task = Task.FromResult("OK");
        var res = task.Result;

        // Warning: throw ex
        try
        {
            await Task.Delay(10);
        }
        catch (Exception ex)
        {
            throw ex;
        }

        return Ok(res);
    }
}
